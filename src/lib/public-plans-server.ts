import "server-only";
import { salesBackend } from "@/lib/sales-catalogue-server";
import type { PlanQuote, PlanQuoteRequest, PublicPlanCatalogue } from "@/lib/public-plans";

// The public plans page reads the portal backend with the website's integration key
// (salesBackend public mode → /api/integration/...). Plans on sale + active plan categories.
export async function readPublicPlans(): Promise<PublicPlanCatalogue> {
  return await salesBackend(false, undefined, "plan-catalogue") as PublicPlanCatalogue;
}

export async function quotePublicPlan(body: PlanQuoteRequest): Promise<{ planId: string; quote: PlanQuote }> {
  return await salesBackend(false, body, "plan-catalogue/quote") as { planId: string; quote: PlanQuote };
}
