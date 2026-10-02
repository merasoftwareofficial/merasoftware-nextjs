import { cookies } from "next/headers";
import Link from "@/components/link";
import { SubscribeForm } from "@/components/subscribe/subscribe-form";
import { getSessionUser } from "@/lib/auth";
import { mailConfigured } from "@/lib/mailer";
import { NOTIFY_COOKIE, topicChoices } from "@/lib/notify-rules";
import { pushPublicKey } from "@/lib/push";
import { categoryRepo } from "@/lib/repo";
import { ownSubscriber } from "@/lib/subscription-actions";

/**
 * "Get notified" box: the blog categories to follow plus offers, delivered as
 * browser notifications (and by email once mail is configured). `category` is
 * a category name to tick for someone with no settings yet (the post being read).
 *
 * Starts as one compact line with a button; the topics open from that button,
 * so a reader is not met by a wall of checkboxes. `open` starts it opened, for
 * pages a reader came to on purpose (/subscribe).
 *
 * In production it shows nothing while no channel is configured, so the site
 * never offers something that cannot work. Outside production it always shows
 * (`preview`), so the design can be seen locally without keys; its button then
 * only says notifications are not available (owner decision, 2 Oct 2026).
 */
export async function SubscribeBox({ category, title, open = false }: { category?: string; title?: string; open?: boolean }) {
  const pushKey = pushPublicKey();
  const mailOn = mailConfigured();
  const preview = !pushKey && !mailOn && process.env.NODE_ENV !== "production";
  if (!pushKey && !mailOn && !preview) return null;

  const [categories, user, store] = await Promise.all([categoryRepo.list(), getSessionUser(), cookies()]);
  const topics = topicChoices(categories);
  const mine = await ownSubscriber(null, user, store.get(NOTIFY_COOKIE)?.value);
  const followed = mine ? topics.filter(topic => mine.categories.includes(topic._id)).length + (mine.offers ? 1 : 0) : 0;

  const pushShown = !!pushKey || preview;
  const heading = title ?? (pushShown ? "Get new posts on your phone" : "Get new posts by email");
  const lead = mine
    ? `You follow ${followed} ${followed === 1 ? "topic" : "topics"}.`
    : "Pick the topics you like. We notify you only when a post on those goes live.";
  const perks = pushShown ? ["Free", "No login or email needed", "Turn off anytime"] : ["Free", "Unsubscribe anytime"];

  return (
    <section className="subscribe-box subscribe-compact" aria-labelledby="subscribe-title">
      <div className="subscribe-head">
        <span className="subscribe-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </span>
        <div>
          <h2 id="subscribe-title">{heading}</h2>
          <p className="subscribe-lead">
            {lead}
            {mine ? (
              <>
                {" "}
                <Link className="text-link" href="/subscribe/manage">
                  Manage <span>→</span>
                </Link>
              </>
            ) : null}
          </p>
          {mine ? null : (
            <ul className="subscribe-perks">
              {perks.map(perk => <li key={perk}>{perk}</li>)}
            </ul>
          )}
        </div>
      </div>
      <SubscribeForm
        topics={topics}
        preselected={mine ? mine.categories : topics.filter(topic => topic.name === category).map(topic => topic._id)}
        offers={mine?.offers ?? false}
        email={user?.email ?? ""}
        pushKey={pushKey}
        mailOn={mailOn}
        preview={preview}
        open={open}
        startLabel={mine ? "Change topics" : "Turn on"}
      />
    </section>
  );
}
