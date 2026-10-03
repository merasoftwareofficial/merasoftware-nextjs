/**
 * Who may subscribe to what, and how a choice is cleaned before it is saved.
 * Shared by the subscribe routes and the forms (src/docs/NOTIFICATIONS.md).
 */

import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Blog, Category, Subscriber } from "@/lib/repo/types";
import { SITE_URL } from "@/lib/structured-data";

/** At most one confirm or manage-link mail per address in this time. */
export const MAIL_COOLDOWN_MS = 10 * 60 * 1000;

/** The secret in manage, confirm and unsubscribe links. */
export function newToken() {
  return randomBytes(32).toString("base64url");
}

const categoryIds = z.array(z.string().trim().min(1).max(64)).max(100);

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  categories: categoryIds,
  offers: z.boolean(),
  // Hidden field: people never see it, bots fill it in.
  website: z.string().optional(),
}).refine(data => data.categories.length > 0 || data.offers, { message: "Choose at least one topic." });

export const preferencesSchema = z.object({
  token: z.string().max(100).optional(),
  categories: categoryIds,
  offers: z.boolean(),
});

/** A browser's PushSubscription.toJSON(). */
const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000).refine(value => value.startsWith("https://"), "The push address must use https."),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** A browser's push subscription, plus the topics chosen with it. */
export const pushDeviceSchema = z.object({
  subscription: pushSubscriptionSchema,
  categories: categoryIds,
  offers: z.boolean(),
}).refine(data => data.categories.length > 0 || data.offers, { message: "Choose at least one topic." });

/** An admin's browser asking for activity alerts ("Admin alerts" in NOTIFICATIONS.md). */
export const staffDeviceSchema = z.object({ subscription: pushSubscriptionSchema });

/**
 * An admin browser not seen in the panel for this long gets no more alerts and
 * is deleted: the portal admin role is not stored here, so a person who lost
 * it is dropped this way.
 */
export const STAFF_DEVICE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/** An admin alert later than this after the activity is not sent (only a cron backstop would be that late). */
export const STAFF_ALERT_STALE_MS = 24 * 60 * 60 * 1000;

/** Cookie holding a visitor's settings token on this browser (push without login). */
export const NOTIFY_COOKIE = "ms_notify";

/** The categories a person can choose: active ones, by name. */
export function topicChoices(categories: Category[]) {
  return categories.filter(category => !category.archived).map(({ _id, name }) => ({ _id, name }));
}

/**
 * The ids to save from a form. Unknown and archived ids sent by the form are
 * dropped; archived ids the subscriber already had are kept, so restoring a
 * category brings its subscribers back.
 */
export function cleanCategories(categories: Category[], chosen: string[], current: string[] = []) {
  const byId = new Map(categories.map(category => [category._id, category]));
  const picked = chosen.filter(categoryId => byId.get(categoryId)?.archived === false);
  const kept = current.filter(categoryId => byId.get(categoryId)?.archived === true);
  return [...new Set([...picked, ...kept])];
}

/** May another confirm or manage-link mail go to this subscriber now? */
export function canMail(subscriber: Pick<Subscriber, "confirmSentAt">, now = Date.now()) {
  return !subscriber.confirmSentAt || now - Date.parse(subscriber.confirmSentAt) >= MAIL_COOLDOWN_MS;
}

/**
 * The address links in mails point at. Production always uses the real
 * domain; a preview or local server uses its own, so a test mail opens there.
 */
export function linkBase(requestUrl: string) {
  return process.env.VERCEL_ENV === "production" ? SITE_URL : new URL(requestUrl).origin;
}

/** A notification later than this after the post went live is not sent: old news reads like spam. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * Does this change announce a post? Only an official, public post with a
 * category, on its first publish — `before` never had a publish date, so an
 * edit, an unpublish and a republish announce nothing.
 */
export function postNotifiable(before: Blog | null, now: Blog | null) {
  if (!now || now.status !== "published" || now.type !== "official" || now.visibility !== "public" || !now.category) return false;
  return !before?.publishedAt && before?.status !== "published";
}

/** May a job for this post still go out? `publishedAt` is when the post went live. */
export function stillFresh(post: Pick<Blog, "publishedAt">, now = Date.now()) {
  return !!post.publishedAt && now - Date.parse(post.publishedAt) < STALE_AFTER_MS;
}

/** What the preference page and the box say about the email channel. */
export function emailState(subscriber: Pick<Subscriber, "email" | "emailStatus"> | null) {
  if (!subscriber?.email || subscriber.emailStatus === "none") return "off";
  return subscriber.emailStatus;
}
