import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { emailControlRequest, EmailServiceError } from "@/lib/email-control-server";
import type { EmailDraft } from "@/lib/email-control-types";
import { subscriberRepo } from "@/lib/repo";

type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (
  (method === "GET" && (path === "" || path === "outbox" || path === "summary" || /^drafts\/[a-f\d]{24}$/i.test(path))) ||
  (method === "POST" && (path === "templates" || path === "templates/preview" || /^templates\/[a-f\d]{24}\/reset$/i.test(path) || /^drafts\/[a-f\d]{24}\/(decision|preview)$/i.test(path))) ||
  (method === "PUT" && (/^policies\/[\w.]+$/.test(path) || /^templates\/[a-f\d]{24}$/i.test(path)))
);
async function handle(request: Request, context: Context) {
  try {
    const path = ((await context.params).path || []).join("/");
    if (!allowed(request.method, path)) return NextResponse.json({ error: "Unknown email action." }, { status: 404 });
    const application = new URL(request.url).searchParams.get("application") || "website";
    if (!["website", "portal"].includes(application)) throw new EmailServiceError("Unknown application.", 400);
    const session = await getSession();
    if (!session) throw new AuthError("Sign in to continue.", 401);
    if (session.user.role !== "admin") throw new AuthError("Admin access required.", 403);
    if (application === "portal" && !session.portalRoles.includes("admin")) throw new AuthError("Portal admin access required.", 403);
    const token = (await cookies()).get("token")?.value;
    const actorId = session.user.portalUserId;
    if (!token || !actorId) throw new AuthError("Sign in again to manage email.", 401);
    const authorization = application === "website" ? { access: "admin" as const, actorId } : { cookie: token };
    const queryParams = new URLSearchParams({ application });
    if (path === "outbox") {
      const input = new URL(request.url).searchParams;
      for (const key of ["status", "q", "from", "to", "page"]) {
        const value = input.get(key);
        if (value !== null) queryParams.set(key, value);
      }
    }
    const query = `?${queryParams}`;
    const body = request.method === "GET" ? undefined : await request.json();
    if (application === "website" && path.endsWith("/decision") && body.choice === "send") {
      const draft = await emailControlRequest<EmailDraft>(`/${path.replace(/\/decision$/, "")}${query}`, "GET", undefined, authorization);
      if (draft.event.startsWith("website.subscription.")) {
        const reference = draft.reference;
        const subscriber = reference?.subscriberId ? await subscriberRepo.findById(reference.subscriberId) : null;
        if (!subscriber?.email || createHash("sha256").update(subscriber.token).digest("hex") !== reference?.tokenHash || draft.to.length !== 1 || draft.to[0] !== subscriber.email || ["unsubscribed", "bounced", "none"].includes(subscriber.emailStatus) || (draft.event === "website.subscription.confirm" && subscriber.emailStatus !== "pending")) {
          throw new EmailServiceError("This subscription request has changed. Skip this draft and use a current request.", 409);
        }
      }
    }
    const data = await emailControlRequest<{ status?: string; sentAt?: string; reference?: { subscriberId?: string } }>(`/${path}${query}`, request.method, body, authorization);
    if (application === "website" && path.endsWith("/decision") && data.status === "sent" && data.reference?.subscriberId) {
      try {
        if (!data.sentAt || !Number.isFinite(Date.parse(data.sentAt))) throw new Error("Sending service did not return sentAt");
        await subscriberRepo.update(data.reference.subscriberId, { confirmSentAt: data.sentAt });
      }
      catch { console.error("[email] Email delivered; subscriber delivery timestamp could not be updated."); }
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError || error instanceof EmailServiceError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email request failed." }, { status });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
