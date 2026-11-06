import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PORTAL_COOKIE } from "@/lib/portal";
import { portalApiRequest, PortalApiError } from "@/lib/portal-api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { errorResponse } from "@/lib/api";
export const dynamic = "force-dynamic";

// "Start my project" on a reserved offer (src/docs/reservation-countdown.md): a pass-through to the
// backend, which pauses the clock and tells the team and the customer (helpers/reservationStart.js).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireUser();
    const { id } = await params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Choose a reservation" }, { status: 400 });
    const token = (await cookies()).get(PORTAL_COOKIE)?.value;
    const data = await portalApiRequest("Offer reservations", `/api/offer-reservations/${id}/start`, "POST", { Cookie: `${PORTAL_COOKIE}=${token}` }, {});
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
