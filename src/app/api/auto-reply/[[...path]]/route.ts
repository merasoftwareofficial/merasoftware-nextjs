import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (method === "GET" && path === "status") || (method === "POST" && ["switches", "message"].includes(path));
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown Auto Reply action." }, { status: 404 });
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) throw new AuthError("Admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    if (!token) throw new AuthError("Sign in again to manage Auto Reply.", 401);
    const body = request.method === "POST" ? await request.json() : undefined;
    const data = await portalApiRequest("Auto Reply", `/api/auto-reply/${path}`, request.method, { Cookie: `token=${token}` }, body);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto Reply request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
