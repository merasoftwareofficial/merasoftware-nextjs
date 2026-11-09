import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PORTAL_COOKIE } from "@/lib/portal";
import { portalApiRequest, PortalApiError } from "@/lib/portal-api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { errorResponse } from "@/lib/api";
export const dynamic = "force-dynamic";

// Buying a package project on the customize page: a pass-through to the portal backend
// (helpers/packagePurchase.js), which prices the choice, creates the project with the customer's first
// payment and tells the team. GET gives the wallet balance and the UPI payee the payment popup shows.
// The customer's own sign-in goes with the call; no price is ever taken from this request.
async function handle(request: Request, method: "GET" | "POST") {
  try {
    if (method === "POST") requireSameOrigin(request);
    await requireUser();
    const token = (await cookies()).get(PORTAL_COOKIE)?.value;
    const input = method === "POST" ? await request.json().catch(() => null) : undefined;
    if (method === "POST" && (!input || typeof input !== "object")) return NextResponse.json({ error: "Choose the package options again." }, { status: 400 });
    const body = input ? { packageId: input.packageId, choice: input.choice, quoteKey: input.quoteKey, dueNow: input.dueNow, creationKey: input.creationKey,
      upiTransactionId: input.upiTransactionId, countryCode: input.countryCode, phone: input.phone } : undefined;
    const path = method === "GET" ? "/api/package-starts/payment-info" : "/api/package-starts/purchase";
    const data = await portalApiRequest("Package purchase", path, method, { Cookie: `${PORTAL_COOKIE}=${token}` }, body);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
