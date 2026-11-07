import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PORTAL_COOKIE } from "@/lib/portal";
import { portalApiRequest, PortalApiError } from "@/lib/portal-api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { errorResponse } from "@/lib/api";
export const dynamic = "force-dynamic";

// "Start my project" on a package page without an offer (src/docs/package-offers.md): a pass-through to the
// backend, which records the request and tells the team and the customer (helpers/packageStart.js).
async function handle(request: Request, method: "GET" | "POST") {
  try {
    if (method === "POST") requireSameOrigin(request);
    await requireUser();
    const token = (await cookies()).get(PORTAL_COOKIE)?.value;
    const input = method === "POST" ? await request.json() : undefined;
    // Phone is forwarded only for older accounts the portal asked for one (HTTP 428).
    const body = input ? { packageId: input.packageId, countryCode: input.countryCode, phone: input.phone } : undefined;
    const data = await portalApiRequest("Package start requests", "/api/package-starts", method, { Cookie: `${PORTAL_COOKIE}=${token}` }, body);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
