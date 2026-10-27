import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { salesBackend } from "@/lib/sales-catalogue-server";
import { readPlanCatalogue } from "@/lib/service-plans-server";

// Website admin plan catalogue. The portal backend owns every rule and every price
// (helpers/servicePlanCatalogue.js, servicePlanLifecycle.js, servicePlanPricing.js); this route
// only forwards the admin's request with the admin cookie (salesBackend).
export async function GET() {
  try { return NextResponse.json(await readPlanCatalogue(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

// { target: "plan", ...savePlan body or { action, planId } } · { target: "category", ...category }
// · { target: "quote", planId | settings, purchase, tenureMonths, files, updates, releaseMode }
const PATHS = { plan: "plan-catalogue", category: "plan-categories", quote: "plan-catalogue/quote" } as const;
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const { target, ...body } = await request.json();
    const path = PATHS[target as keyof typeof PATHS];
    if (!path) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    return NextResponse.json(await salesBackend(true, body, path) ?? {});
  }
  catch (error) { return errorResponse(error); }
}
