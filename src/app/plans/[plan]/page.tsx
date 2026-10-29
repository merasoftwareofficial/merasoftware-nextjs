import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlanBuilder, type PlanViewer } from "@/components/plans/plan-builder";
import { getSession } from "@/lib/auth";
import { pageMetadata } from "@/lib/page-seo";
import { portalAddresses } from "@/lib/portal";
import { initialChoice, planIdFromSegment, plainText, PLANS_PAGE_PATH, type PublicPlanCatalogue } from "@/lib/public-plans";
import { readPublicPlans } from "@/lib/public-plans-server";
import c from "@/components/campaign/campaign.module.css";
import s from "@/components/plans/plans.module.css";
export const dynamic = "force-dynamic";

// One plan's own page (/plans/<name>-<id>, opened from a card on /plans). The visitor customizes the
// plan and sees the portal backend's price without signing in; components/plans/plan-builder.tsx.
// A plan that is not on sale is a 404. The id finds the plan, so an old name in the address still works.
type Props = { params: Promise<{ plan: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = planIdFromSegment((await params).plan);
  return id ? pageMetadata(`plans-${id}`) : {};
}

export default async function Page({ params, searchParams }: Props) {
  const id = planIdFromSegment((await params).plan);
  if (!id) notFound();
  let catalogue: PublicPlanCatalogue | null = null;
  try { catalogue = await readPublicPlans(); } catch { /* No stale or made-up prices during an outage. */ }
  const plan = catalogue?.plans.find(entry => entry._id === id);
  if (catalogue && !plan) notFound();

  const back = <div style={{ paddingTop: 32, marginBottom: 24 }}><Link className="text-link" href={PLANS_PAGE_PATH}>← All plans</Link></div>;
  if (!plan) {
    return <><SiteHeader /><main className={c.page}><div className={c.wrap}>{back}<section className={c.section}><p>Plan details are temporarily unavailable. Please contact us for current plans and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about plans →</a></section></div></main><SiteFooter /></>;
  }

  // Who is looking decides where "Get this plan" leads (portal client, signed-in member or visitor).
  const session = await getSession();
  const viewer: PlanViewer = !session ? "visitor" : session.portalRoles.includes("customer") ? "client" : "member";
  let portalUrl = "";
  try { portalUrl = portalAddresses().portalUrl; } catch { /* Clients then reach the team instead. */ }

  const category = catalogue!.categories.find(entry => entry.key === plan.categoryKey)?.label;
  const description = plainText(plan.description || "");
  const intro = (
    <div className={s.intro}>
      {category && <p className={s.fine}>{category}</p>}
      <h1>{plan.serviceName}</h1>
      {description && <p>{description}</p>}
    </div>
  );
  const initial = initialChoice(plan, await searchParams);

  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          {back}
          {initial
            ? <PlanBuilder plan={plan} initial={initial} viewer={viewer} portalUrl={portalUrl} intro={intro} />
            : <>{intro}<p>This plan cannot be bought right now. <a className="text-link" href="mailto:contact@merasoftware.com">Contact us →</a></p></>}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
