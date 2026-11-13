import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (method === "GET" && (["status", "final-message", "reservations", "payment-reminders", "business-activity", "reminder-rules", "reminder-work-summary", "reminder-runs", "legacy-reminder-history", "actions"].includes(path) || /^reminder-rules\/[a-f\d]{24}\/preview$/i.test(path) || /^reservations\/[a-f\d]{24}\/paid-projects$/i.test(path))) || (method === "POST" && (["switches", "message", "reply", "final-message/time", "final-message/ignored", "final-message/decision", "reminder-rules", "reminder-controls"].includes(path) || /^reminder-rules\/[a-f\d]{24}\/enabled$/i.test(path) || /^reminder-runs\/[a-f\d]{24}\/retry$/i.test(path) || /^reservations\/[a-f\d]{24}\/reminders$/i.test(path) || /^reservations\/[a-f\d]{24}\/reconcile-paid-project$/i.test(path) || /^package-starts\/[a-f\d]{24}\/close$/i.test(path))) || (method === "PUT" && (/^reminder-rules\/[a-f\d]{24}$/i.test(path) || /^actions\/[AB]\d{2,3}$/.test(path)));
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown Auto Reply action." }, { status: 404 });
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin" || !session.portalRoles.includes("admin")) throw new AuthError("Admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    if (!token) throw new AuthError("Sign in again to manage Auto Reply.", 401);
    const body = request.method === "POST" || request.method === "PUT" ? await request.json() : undefined;
    const page = ["payment-reminders", "reminder-runs", "legacy-reminder-history"].includes(path) ? new URL(request.url).searchParams.get("page") : null;
    const view = ["reminder-runs", "payment-reminders"].includes(path) ? new URL(request.url).searchParams.get("view") : null;
    const params = new URLSearchParams();
    if (page) params.set("page", page);
    if (view) params.set("view", view);
    if (path === "reminder-runs") {
      const source = new URL(request.url).searchParams.get("source");
      if (source) params.set("source", source);
    }
    if (path === "legacy-reminder-history") {
      const search = new URL(request.url).searchParams;
      for (const name of ["source", "entityId"]) { const value = search.get(name); if (value) params.set(name, value); }
    }
    const query = params.size ? `?${params}` : "";
    const data = await portalApiRequest("Auto Reply", `/api/auto-reply/${path}${query}`, request.method, { Cookie: `token=${token}` }, body);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof PortalApiError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto Reply request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
