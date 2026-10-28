import type { Metadata } from "next";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlanCard } from "@/components/plans/plan-card";
import { pageMetadata } from "@/lib/page-seo";
import { portalAddresses } from "@/lib/portal";
import { PLANS_PAGE_INTRO, PLANS_PAGE_TITLE, type PublicPlanCatalogue } from "@/lib/public-plans";
import { readPublicPlans } from "@/lib/public-plans-server";
import c from "@/components/campaign/campaign.module.css";
import s from "@/components/plans/plans.module.css";
export const dynamic = "force-dynamic";

// The public plans page in the "Pricing & Packages" menu (docs/plan.md §0.2 P6). Marketing only:
// plans on sale, grouped by plan category, each with an estimator priced by the portal backend.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("plans");
}

export default async function Page() {
  let catalogue: PublicPlanCatalogue | null = null;
  try { catalogue = await readPublicPlans(); } catch { /* No stale or made-up prices during an outage. */ }
  // Plans are bought on the portal's own plan page (frontend route service-plan-detail/:planId).
  let portalUrl = "";
  try { portalUrl = portalAddresses().portalUrl; } catch { /* Without it the card offers the enquiry only. */ }
  const categories = catalogue ? [...catalogue.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label)) : [];
  const groups = catalogue
    ? [
        ...categories.map(category => ({ key: category.key, label: category.label, description: category.description, plans: catalogue!.plans.filter(plan => plan.categoryKey === category.key) })),
        { key: "other", label: "More plans", description: "", plans: catalogue.plans.filter(plan => !categories.some(category => category.key === plan.categoryKey)) },
      ].filter(group => group.plans.length)
    : [];

  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          <div style={{ paddingTop: 32, marginBottom: 24 }}><Link className="text-link" href="/">← Back to home</Link></div>
          <section className={c.showcaseHero}>
            <p className={c.kicker}>PRICING &amp; PACKAGES</p>
            <h1>{PLANS_PAGE_TITLE}</h1>
            <p>{PLANS_PAGE_INTRO}</p>
            {catalogue && <div className={c.pills}><span>{catalogue.plans.length} plan{catalogue.plans.length === 1 ? "" : "s"}</span></div>}
          </section>
          {!catalogue ? (
            <section className={c.section}><p>Plan details are temporarily unavailable. Please contact us for current plans and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about plans →</a></section>
          ) : !groups.length ? (
            <p>No plans are available right now. Contact us for a quotation.</p>
          ) : groups.map(group => (
            <section key={group.key} className={s.category}>
              <h2>{group.label}</h2>
              {group.description ? <p>{group.description}</p> : null}
              <div className={s.grid}>{group.plans.map(plan => <PlanCard key={plan._id} plan={plan} categoryLabel={group.label} buyHref={portalUrl ? `${portalUrl}/service-plan-detail/${plan._id}` : ""} />)}</div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
