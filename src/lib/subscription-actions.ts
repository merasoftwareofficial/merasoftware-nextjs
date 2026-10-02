import "server-only";

/**
 * The writes behind subscribing (src/docs/NOTIFICATIONS.md). Routes validate
 * input with notify-rules.ts and call these.
 *
 * Control of an address needs proof of it: a request that is not that
 * address's own (its confirm/manage link, or the account it is linked to) never
 * changes the choices of an active or account-linked record — it mails the
 * owner a manage link instead.
 */

import { sendMail } from "@/lib/mailer";
import { confirmMail, manageMail } from "@/lib/notify-emails";
import { canMail, cleanCategories, newToken } from "@/lib/notify-rules";
import { categoryRepo, pushDeviceRepo, subscriberRepo, type Category, type Subscriber, type User } from "@/lib/repo";

/** "check-inbox" is also the answer when nothing was changed, so the reply never tells a stranger whether an address is subscribed. */
export type SubscribeResult = "check-inbox" | "saved";

const confirmUrl = (base: string, subscriber: Subscriber) => `${base}/api/subscribe/confirm?token=${encodeURIComponent(subscriber.token)}`;
const manageUrl = (base: string, subscriber: Subscriber) => `${base}/subscribe/manage?token=${encodeURIComponent(subscriber.token)}`;

function topicNames(categories: Category[], subscriber: Pick<Subscriber, "categories" | "offers">) {
  const names = categories.filter(category => subscriber.categories.includes(category._id)).map(category => category.name);
  return subscriber.offers ? [...names, "offers"] : names;
}

/** Sends one confirm or manage-link mail unless one went out in the last 10 minutes. */
async function mailOnce(subscriber: Subscriber, build: () => Parameters<typeof sendMail>[0]) {
  if (!canMail(subscriber)) return;
  // Not stamped when mail is not configured, so the mail can still go once it is.
  if (await sendMail(build())) await subscriberRepo.update(subscriber._id, { confirmSentAt: new Date().toISOString() });
}

export async function subscribe(
  input: { email: string; categories: string[]; offers: boolean; website?: string },
  user: User | null,
  base: string,
  cookieToken?: string | null,
): Promise<SubscribeResult> {
  // A bot filled the hidden field: answer as usual and do nothing.
  if (input.website) return "check-inbox";

  const categories = await categoryRepo.list();
  const chosen = cleanCategories(categories, input.categories);
  if (!chosen.length && !input.offers) throw new Error("Choose at least one topic.");

  const byEmail = await subscriberRepo.findByEmail(input.email);

  if (byEmail && (byEmail.emailStatus === "active" || byEmail.userId)) {
    // The linked account itself may change its own choices here.
    if (user && byEmail.userId === user._id) {
      await subscriberRepo.update(byEmail._id, {
        categories: cleanCategories(categories, input.categories, byEmail.categories),
        offers: input.offers,
        ...(byEmail.emailStatus === "active" ? {} : { emailStatus: "pending" as const }),
      });
      if (byEmail.emailStatus === "active") return "saved";
      const updated = (await subscriberRepo.findById(byEmail._id))!;
      await mailOnce(updated, () => confirmMail(updated.email!, topicNames(categories, updated), confirmUrl(base, updated)));
      return "check-inbox";
    }
    await mailOnce(byEmail, () => manageMail(byEmail.email!, manageUrl(base, byEmail)));
    return "check-inbox";
  }

  // This account's or this browser's settings without an email (push) take the address.
  const mine = await ownSubscriber(null, user, cookieToken);
  const target = byEmail ?? (mine && !mine.email ? mine : null);
  const choice = {
    email: input.email,
    emailStatus: "pending" as const,
    categories: chosen,
    offers: input.offers,
    // Linked only when the confirm link proves the address (the portal does not verify emails).
    pendingUserId: user && target?.userId !== user._id ? user._id : undefined,
  };

  let subscriber: Subscriber;
  if (target) {
    subscriber = (await subscriberRepo.update(target._id, choice))!;
  } else {
    try {
      subscriber = await subscriberRepo.create({ ...choice, token: newToken() });
    } catch (error) {
      // Another request created this address a moment ago; it gets its own confirm mail.
      if (error instanceof Error && error.message.includes("already subscribed")) return "check-inbox";
      throw error;
    }
  }

  await mailOnce(subscriber, () => confirmMail(subscriber.email!, topicNames(categories, subscriber), confirmUrl(base, subscriber)));
  return "check-inbox";
}

/**
 * The confirm link. Turns a pending address active and, if a signed-in user
 * asked for it, links that account — taking over the account's earlier
 * settings record if it had no email of its own. Null for an unknown token.
 */
export async function confirmSubscription(token: string): Promise<Subscriber | null> {
  const subscriber = await subscriberRepo.findByToken(token);
  if (!subscriber?.email) return null;
  // An old confirm mail must not undo a later unsubscribe.
  if (subscriber.emailStatus !== "pending") return subscriber;

  const patch: Partial<Subscriber> = { emailStatus: "active", emailConfirmedAt: new Date().toISOString(), pendingUserId: undefined };

  const userId = subscriber.pendingUserId;
  if (userId && !subscriber.userId) {
    const other = await subscriberRepo.findByUserId(userId);
    if (!other) patch.userId = userId;
    else if (!other.email) {
      // One person, one record: the account's push devices come along.
      await pushDeviceRepo.moveSubscriber(other._id, subscriber._id);
      await subscriberRepo.remove(other._id);
      patch.userId = userId;
    }
    // An account already linked to another address keeps that one.
  }
  return subscriberRepo.update(subscriber._id, patch);
}

/** Saves the choices of a subscriber the caller has already proved to own. */
export async function updatePreferences(subscriber: Subscriber, input: { categories: string[]; offers: boolean }) {
  const categories = cleanCategories(await categoryRepo.list(), input.categories, subscriber.categories);
  return subscriberRepo.update(subscriber._id, { categories, offers: input.offers });
}

/** Stops mail to a subscriber the caller has proved to own. Topic choices are kept for the other channels. */
export async function unsubscribe(subscriber: Subscriber) {
  if (!subscriber.email) return null;
  if (subscriber.emailStatus === "unsubscribed") return subscriber;
  return subscriberRepo.update(subscriber._id, { emailStatus: "unsubscribed" });
}

/**
 * The record a request may manage: the manage link's token, else the signed-in
 * user's, else this browser's (the NOTIFY_COOKIE token set when push was
 * allowed without login). A browser's record not yet tied to an account is
 * still offered to a user who signs in on it.
 */
export async function ownSubscriber(token: string | undefined | null, user: User | null, cookieToken?: string | null) {
  if (token) return subscriberRepo.findByToken(token);
  const fromCookie = cookieToken ? await subscriberRepo.findByToken(cookieToken) : null;
  if (user) return (await subscriberRepo.findByUserId(user._id)) ?? (fromCookie && !fromCookie.userId && !fromCookie.email ? fromCookie : null);
  return fromCookie;
}

/**
 * Saves a browser's push subscription with the topics chosen beside it.
 * Signed in: on the account's record (taking over this browser's record if it
 * has no owner yet). Signed out: on this browser's record, made on first use.
 * Returns the record; the route sets its token as the browser's cookie.
 */
export async function registerPush(
  input: { subscription: { endpoint: string; keys: { p256dh: string; auth: string } }; categories: string[]; offers: boolean },
  user: User | null,
  cookieToken: string | null,
  userAgent: string | null,
) {
  const categories = await categoryRepo.list();
  let subscriber = await ownSubscriber(null, user, cookieToken);
  const chosen = cleanCategories(categories, input.categories, subscriber?.categories);
  if (!chosen.length && !input.offers) throw new Error("Choose at least one topic.");

  if (subscriber) {
    subscriber = (await subscriberRepo.update(subscriber._id, {
      categories: chosen,
      offers: input.offers,
      ...(user && !subscriber.userId ? { userId: user._id } : {}),
    }))!;
  } else {
    subscriber = await subscriberRepo.create({ emailStatus: "none", token: newToken(), categories: chosen, offers: input.offers, userId: user?._id });
  }

  await pushDeviceRepo.upsert({
    subscriberId: subscriber._id,
    endpoint: input.subscription.endpoint,
    p256dh: input.subscription.keys.p256dh,
    auth: input.subscription.keys.auth,
    userAgent: userAgent?.slice(0, 300) || undefined,
  });
  return subscriber;
}

/** Turns push off on one browser. The endpoint is that browser's own secret address. */
export async function unregisterPush(endpoint: string) {
  return pushDeviceRepo.removeByEndpoint(endpoint);
}
