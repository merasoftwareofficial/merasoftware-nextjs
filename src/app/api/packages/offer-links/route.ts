import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
// Offers are linked to their package only from the package form (src/docs/package-offers.md, owner decision
// 7 Nov 2026). The portal's own offer-links route stays: the package save links a published offer through it
// (lib/offer-save-server.ts).
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    return NextResponse.json({ error: "Offers are linked from the package form. Open the package in Packages." }, { status: 410 });
  }
  catch (error) { return errorResponse(error); }
}
