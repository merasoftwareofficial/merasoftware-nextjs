import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

type Context = { params: Promise<{ path?: string[] }> };
const ID = "[a-f\\d]{24}";
const SLUG = "[a-z0-9][a-z0-9-]{0,119}";
const allowed = (method: string, path: string) => (
  (method === "GET" && new RegExp(`^offers/${SLUG}(/candidates)?$`, "i").test(path)) ||
  (method === "POST" && (new RegExp(`^offers/${SLUG}/people$`, "i").test(path) || new RegExp(`^people/${ID}/bought$`, "i").test(path))) ||
  (method === "PATCH" && (new RegExp(`^people/${ID}/stage$`, "i").test(path) || new RegExp(`^leads/${ID}/behaviour$`, "i").test(path)))
);
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown action." }, { status: 404 });
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) throw new AuthError("Admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    if (!token) throw new AuthError("Sign in again to continue.", 401);
    const body = request.method === "GET" ? undefined : await request.json().catch(() => ({}));
    const data = await portalApiRequest("Offer targets", `/api/offer-targets/${path}`, request.method, { Cookie: `token=${token}` }, body);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
