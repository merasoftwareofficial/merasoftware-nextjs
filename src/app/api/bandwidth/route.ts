import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

async function requireAdminToken() {
  const session = await getSession();
  if (!session) throw new AuthError("Sign in to continue.", 401);
  if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) {
    throw new AuthError("Admin access required.", 403);
  }
  const token = (await cookies()).get("token")?.value;
  if (!token) throw new AuthError("Sign in again to view bandwidth usage.", 401);
  return token;
}

export async function GET(request: Request) {
  try {
    const token = await requireAdminToken();
    const url = new URL(request.url);
    const windowParam = url.searchParams.get("window") === "1h" ? "1h" : "24h";
    const data = await portalApiRequest(
      "Bandwidth monitor",
      `/api/bandwidth-control/usage?window=${windowParam}`,
      "GET",
      { Cookie: `token=${token}` },
    );
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load bandwidth usage." }, { status });
  }
}

export async function POST() {
  try {
    const token = await requireAdminToken();
    const data = await portalApiRequest(
      "Bandwidth monitor",
      "/api/bandwidth-control/reset",
      "POST",
      { Cookie: `token=${token}` },
      {},
    );
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reset bandwidth counters." }, { status });
  }
}
