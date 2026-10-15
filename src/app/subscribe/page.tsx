import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SubscribeBox } from "@/components/subscribe/subscribe-box";
import { loadVisuals } from "@/lib/section-visuals";

export const metadata = { title: "Get notified", description: "Get notified about new posts on the topics you choose, and offers if you want them." };
export const dynamic = "force-dynamic";

export default async function Subscribe() {
  const visuals = await loadVisuals(["subscribe.hero"]);
  // Null while no channel is configured (see SubscribeBox).
  const box = await SubscribeBox({ open: true });
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero eyebrow="NOTIFICATIONS" title="Useful updates for your business." text="Choose the topics you want to learn about. Get notified when new posts are published in those categories, and choose whether to receive offers." visual={visuals["subscribe.hero"]} />
        <section className="content-section section-soft"><div className="container">
          {box ?? (
            <div className="admin-empty">
              <b>Notifications are not available yet.</b>
            </div>
          )}
        </div></section>
      </main>
      <SiteFooter />
    </>
  );
}
