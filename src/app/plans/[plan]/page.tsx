import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlanBuilder, type PlanViewer } from "@/components/plans/plan-builder";
import { getSession } from "@/lib/auth";
import { pageMetadata } from "@/lib/page-seo";
import { phoneCountries } from "@/lib/phone-countries";
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

  if (!plan) {
    return <><SiteHeader /><main className={c.page}><div className={c.wrap}><div style={{ paddingTop: 32 }}><Link className="text-link" href={PLANS_PAGE_PATH}>← All plans</Link></div><section className={c.section}><p>Plan details are temporarily unavailable. Please contact us for current plans and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about plans →</a></section></div></main><SiteFooter /></>;
  }

  // Who is looking decides what "Get this plan" does: a portal client buys in the portal, a signed-in
  // member or a visitor asks the team (app/api/plan-request). The portal opens its plan page only in
  // the client role, so a client signed in under another role (staff) is told to switch first.
  const session = await getSession();
  let portalUrl = "";
  try { portalUrl = portalAddresses().portalUrl; } catch { /* Clients then ask the team instead. */ }
  const viewer: PlanViewer = !session ? "visitor" : session.portalRoles.includes("customer") && portalUrl ? "client" : "member";
  const otherRole = viewer === "client" && session?.portalActiveRole !== "customer";
  const countries = viewer === "client" ? [] : await phoneCountries();

  const category = catalogue!.categories.find(entry => entry.key === plan.categoryKey)?.label;
  const description = plainText(plan.description || "");
  // The page heading, as the portal's (frontend/src/components/CustomerPageHeader.js): a centred title
  // with the Back button at the left of its row (on a phone, on its own line above), the category and
  // description under it. It sits above both columns, so the steps and the "Your plan" card start level.
  const heading = (
    <header className={s.head}>
      <div className={s.titleRow}>
        <Link className={s.back} href={PLANS_PAGE_PATH}>← All plans</Link>
        <h1>{plan.serviceName}</h1>
      </div>
      {category && <p className={s.fine}>{category}</p>}
      {description && <p className={s.lead}>{description}</p>}
    </header>
  );
  const initial = initialChoice(plan, await searchParams);

  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          {heading}
          {initial
            ? <PlanBuilder plan={plan} initial={initial} viewer={viewer} portalUrl={portalUrl} otherRole={otherRole} countries={countries} />
            : <p style={{ textAlign: "center" }}>This plan cannot be bought right now. <a className="text-link" href="mailto:contact@merasoftware.com">Contact us →</a></p>}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
