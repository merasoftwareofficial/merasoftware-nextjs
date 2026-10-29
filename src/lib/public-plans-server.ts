import "server-only";
import { cache } from "react";
import { salesBackend } from "@/lib/sales-catalogue-server";
import type { PlanQuote, PlanQuoteRequest, PublicPlanCatalogue } from "@/lib/public-plans";

// The public plans pages read the portal backend with the website's integration key
// (salesBackend public mode → /api/integration/...). Plans on sale + active plan categories.
// Memoised for one server render: a plan page's metadata, the page and the Page SEO list all ask.
export const readPublicPlans = cache(async (): Promise<PublicPlanCatalogue> => {
  return await salesBackend(false, undefined, "plan-catalogue") as PublicPlanCatalogue;
});

/** The plans on sale, or none while the portal cannot be reached (for lists that must not fail). */
export async function readPublicPlansOrNone(): Promise<PublicPlanCatalogue["plans"]> {
  try { return (await readPublicPlans()).plans; } catch { return []; }
}

export async function quotePublicPlan(body: PlanQuoteRequest): Promise<{ planId: string; quote: PlanQuote }> {
  return await salesBackend(false, body, "plan-catalogue/quote") as { planId: string; quote: PlanQuote };
}
