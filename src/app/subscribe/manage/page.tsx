import { cookies } from "next/headers";
import Link from "@/components/link";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PreferencesForm } from "@/components/subscribe/preferences-form";
import { SubscribeBox } from "@/components/subscribe/subscribe-box";
import { getSessionUser } from "@/lib/auth";
import { emailState, NOTIFY_COOKIE, topicChoices } from "@/lib/notify-rules";
import { pushPublicKey } from "@/lib/push";
import { categoryRepo } from "@/lib/repo";
import { ownSubscriber } from "@/lib/subscription-actions";

// The address can carry a private token: never indexed.
export const metadata = { title: "Your notifications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string; confirmed?: string; invalid?: string; failed?: string }> };

export default async function ManageSubscription({ searchParams }: Props) {
  const { token, confirmed, invalid, failed } = await searchParams;
  const user = token ? null : await getSessionUser();
  const cookie = token ? null : (await cookies()).get(NOTIFY_COOKIE)?.value;
  const [subscriber, categories] = await Promise.all([ownSubscriber(token, user, cookie), categoryRepo.list()]);

  let body: React.ReactNode;
  if (subscriber) {
    body = (
      <>
        {confirmed && subscriber.emailStatus === "active" ? (
          <p className="form-message" role="status">Thanks — your subscription is confirmed.</p>
        ) : null}
        <PreferencesForm
          token={token}
          topics={topicChoices(categories)}
          email={subscriber.email ?? null}
          emailStatus={emailState(subscriber)}
          categories={subscriber.categories}
          offers={subscriber.offers}
          pushKey={pushPublicKey()}
        />
      </>
    );
  } else if (token || invalid || failed) {
    body = (
      <div className="admin-empty">
        <b>{failed ? "Something went wrong." : "This link is not valid any more."}</b>
        <br />
        {failed ? "Please open the link from your mail again in a moment. " : "Use the newest mail from us, or choose your topics again. "}
        <Link className="text-link" href="/subscribe">
          Choose topics <span>→</span>
        </Link>
      </div>
    );
  } else {
    body = (await SubscribeBox({ title: "You have no notifications yet", open: true })) ?? (
      <div className="admin-empty">
        <b>Notifications are not available yet.</b>
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="NOTIFICATIONS" title="Your notifications." text="Choose the topics you hear about, and where." />
        <section className="content-section container">{body}</section>
      </main>
      <SiteFooter />
    </>
  );
}
