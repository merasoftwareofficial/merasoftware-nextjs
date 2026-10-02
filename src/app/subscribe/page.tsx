import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SubscribeBox } from "@/components/subscribe/subscribe-box";

export const metadata = { title: "Get notified", description: "Get notified about new posts on the topics you choose, and offers if you want them." };
export const dynamic = "force-dynamic";

export default async function Subscribe() {
  // Null while no channel is configured (see SubscribeBox).
  const box = await SubscribeBox({ title: "Choose your topics" });
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="NOTIFICATIONS" title="Updates on your topics." text="Pick the blog categories you care about. We notify you only about those — and offers, if you want them." />
        <section className="content-section container">
          {box ?? (
            <div className="admin-empty">
              <b>Notifications are not available yet.</b>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
