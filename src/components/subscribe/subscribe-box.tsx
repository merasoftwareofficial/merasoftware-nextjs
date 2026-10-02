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
 * Shows nothing while no channel is configured, so the site never offers
 * something that cannot work.
 */
export async function SubscribeBox({ category, title = "Get notified about new posts" }: { category?: string; title?: string }) {
  const pushKey = pushPublicKey();
  const mailOn = mailConfigured();
  if (!pushKey && !mailOn) return null;

  const [categories, user, store] = await Promise.all([categoryRepo.list(), getSessionUser(), cookies()]);
  const topics = topicChoices(categories);
  const mine = await ownSubscriber(null, user, store.get(NOTIFY_COOKIE)?.value);

  return (
    <section className="subscribe-box" aria-labelledby="subscribe-title">
      <p className="eyebrow">
        <i /> NOTIFICATIONS
      </p>
      <h2 id="subscribe-title">{title}</h2>
      <p className="subscribe-lead">
        Only the topics you pick — nothing else.
        {mine ? (
          <>
            {" "}
            <Link className="text-link" href="/subscribe/manage">
              Your notification settings <span>→</span>
            </Link>
          </>
        ) : null}
      </p>
      <SubscribeForm
        topics={topics}
        preselected={mine ? mine.categories : topics.filter(topic => topic.name === category).map(topic => topic._id)}
        offers={mine?.offers ?? false}
        email={user?.email ?? ""}
        pushKey={pushKey}
        mailOn={mailOn}
      />
    </section>
  );
}
