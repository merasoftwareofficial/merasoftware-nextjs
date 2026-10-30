import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (
  (method === "GET" && (["audiences", "templates", "history"].includes(path) || /^history\/[a-f\d]{24}\/recipients$/i.test(path))) ||
  (method === "POST" && ["templates", "preview", "send"].includes(path)) ||
  (["PUT", "DELETE"].includes(method) && /^templates\/[a-f\d]{24}$/i.test(path))
);
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown Broadcast action." }, { status: 404 });
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) throw new AuthError("Admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    if (!token) throw new AuthError("Sign in again to manage Broadcast.", 401);
    const body = ["POST", "PUT"].includes(request.method) ? await request.json() : undefined;
    const page = new URL(request.url).searchParams.get("page");
    const query = path.endsWith("/recipients") && page ? `?${new URLSearchParams({ page })}` : "";
    const data = await portalApiRequest("Broadcast", `/api/broadcast/${path}${query}`, request.method, { Cookie: `token=${token}` }, body);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Broadcast request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
