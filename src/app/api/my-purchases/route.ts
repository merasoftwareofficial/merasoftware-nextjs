import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { PORTAL_COOKIE, portalAddresses } from "@/lib/portal";
import { portalApiRequest, PortalApiError } from "@/lib/portal-api";
import { purchasesFrom, type PortalOrder } from "@/lib/my-purchases";
import { errorResponse } from "@/lib/api";
export const dynamic = "force-dynamic";

// A pass-through (docs/plan.md decision 8): the client's own orders come from the portal backend with
// their cookie; the website only trims them for My purchases. Not a client → nothing bought, empty list.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    if (!session.portalRoles.includes("customer")) return NextResponse.json({ purchases: [] }, { headers: { "Cache-Control": "no-store" } });
    const token = (await cookies()).get(PORTAL_COOKIE)?.value;
    const orders = await portalApiRequest<PortalOrder[]>("My purchases", "/api/get-order", "GET", { Cookie: `${PORTAL_COOKIE}=${token}` });
    const purchases = purchasesFrom(Array.isArray(orders) ? orders : [], portalAddresses().portalUrl);
    return NextResponse.json({ purchases }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
