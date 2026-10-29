import "server-only";
import { cache } from "react";
import { salesBackend } from "@/lib/sales-catalogue-server";
import { portalApiRequest } from "@/lib/portal-api";
import { PORTAL_COOKIE } from "@/lib/portal";
import type { PlanQuote, PlanQuoteRequest, PlanRequest, PublicPlanCatalogue } from "@/lib/public-plans";

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

/** A visitor's plan request (no account): sent with the website's integration key. */
export async function requestPlanAsVisitor(body: Omit<PlanRequest, "website">): Promise<{ repeated: boolean }> {
  return await salesBackend(false, body, "plan-request") as { repeated: boolean };
}

/** A signed-in member's plan request: their own portal session decides who is asking. */
export async function requestPlanAsMember(token: string, body: Omit<PlanRequest, "website" | "name" | "email">): Promise<{ repeated: boolean }> {
  return await portalApiRequest<{ repeated: boolean }>("Plan request", "/api/plan-request", "POST", { Cookie: `${PORTAL_COOKIE}=${token}` }, body);
}
