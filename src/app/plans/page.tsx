import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlansCatalogue } from "@/components/plans/plans-catalogue";
import { pageMetadata } from "@/lib/page-seo";
import { PLANS_PAGE_TITLE, type PublicPlanCatalogue } from "@/lib/public-plans";
import { readPublicPlans } from "@/lib/public-plans-server";
import c from "@/components/campaign/campaign.module.css";
export const revalidate = 3600;

// The public Website Update Plans page in the "Packages" menu (docs/plan.md). Marketing only:
// plans on sale, in one unified grid with category filter chips; each opens its own page
// (app/plans/[plan]) to customize it and see the portal backend's price.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("plans");
}

export default async function Page() {
  let catalogue: PublicPlanCatalogue | null = null;
  try { catalogue = await readPublicPlans(); } catch { /* No stale or made-up prices during an outage. */ }

  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          {catalogue ? (
            <PlansCatalogue catalogue={catalogue} />
          ) : (
            <>
              <header className={c.pkgHero}>
                <p className={c.kicker}>PRICING &amp; PACKAGES</p>
                <h1>{PLANS_PAGE_TITLE}</h1>
              </header>
              <section className={c.section}>
                <p>Plan details are temporarily unavailable. Please contact us for current plans and pricing.</p>
                <a href="mailto:contact@merasoftware.com">Enquire about plans →</a>
              </section>
            </>
          )}
        </div>
      </main>
      <SiteFooter whatsappSubject={PLANS_PAGE_TITLE} />
    </>
  );
}
