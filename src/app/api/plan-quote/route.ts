import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { planQuoteSchema } from "@/lib/public-plans";
import { quotePublicPlan } from "@/lib/public-plans-server";

// The public plans page estimator (/plans). The portal backend prices the choice
// (helpers/servicePlanPricing.js quoteServicePlan); this route only checks the request's shape
// and forwards it with the website's integration key. Nothing can be bought here.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = planQuoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose the plan options again." }, { status: 400 });
    return NextResponse.json(await quotePublicPlan(parsed.data), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
