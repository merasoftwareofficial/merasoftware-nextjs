import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { salesBackend } from "@/lib/sales-catalogue-server";
// The offer editor's package ticks; the portal stores them on each package (one offer per package).
export async function PATCH(request: Request) {
  try { requireSameOrigin(request); return NextResponse.json(await salesBackend(true, await request.json(), "sales-packages/offer-links")); }
  catch (error) { return errorResponse(error); }
}
