import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

// Proxy for the WhatsApp admin page to the portal backend's /api/whatsapp-control.
// Admins only, on both sides: the website admin role here, the portal admin role in the backend.
type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (
  (method === "GET" && (path === "status" || path === "queue")) ||
  (method === "POST" && (path === "pause" || path === "resume" || path === "unlink" || /^queue\/[a-f\d]{24}\/retry$/i.test(path)))
);
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown WhatsApp action." }, { status: 404 });
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) throw new AuthError("Admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    if (!token) throw new AuthError("Sign in again to manage WhatsApp.", 401);
    const query = new URLSearchParams();
    if (path === "queue") {
      const input = new URL(request.url).searchParams;
      for (const key of ["status", "page"]) {
        const value = input.get(key);
        if (value !== null) query.set(key, value);
      }
    }
    const data = await portalApiRequest("WhatsApp", `/api/whatsapp-control/${path}${query.size ? `?${query}` : ""}`, request.method, { Cookie: `token=${token}` });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
