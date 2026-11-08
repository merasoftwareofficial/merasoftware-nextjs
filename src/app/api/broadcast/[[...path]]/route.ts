import { createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { mediaRepo } from "@/lib/repo";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { PortalApiError, portalApiRequest } from "@/lib/portal-api";

type Context = { params: Promise<{ path?: string[] }> };
const allowed = (method: string, path: string) => (
  (method === "GET" && (["audiences", "templates", "history"].includes(path) || /^history\/[a-f\d]{24}\/recipients$/i.test(path))) ||
  (method === "POST" && (["templates", "preview", "send"].includes(path) || /^history\/[a-f\d]{24}\/retry-email$/i.test(path))) ||
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
    if (body) {
      delete body.mediaLocked;
      delete body.mediaToken;
      if (body.media) {
        const asset = await mediaRepo.findById(String(body.media.id || ""));
        if (!asset) throw new AuthError("Selected media no longer exists.", 400);
        const secret = process.env.TOKEN_SECRET_KEY;
        if (!secret) throw new AuthError("Media signing is not configured.", 503);
        body.media = { id: asset._id, url: asset.url, kind: asset.kind || "image", bytes: asset.bytes, format: asset.format, publicId: asset.publicId, assetId: asset.assetId };
        const key = createHmac("sha256", secret).update("broadcast-media-v1").digest("hex");
        body.mediaToken = await new SignJWT({ asset: body.media }).setProtectedHeader({ alg: "HS256" }).setIssuer("merasoftware-website").setAudience("broadcast-media").setIssuedAt().setExpirationTime("60s").sign(new TextEncoder().encode(key));
      }
    }
    const params = new URL(request.url).searchParams;
    const page = params.get("page");
    const query = path.endsWith("/recipients") && page ? `?${new URLSearchParams({ page })}` : path === "audiences" && params.has("channel") ? `?${new URLSearchParams({ channel: params.get("channel")! })}` : "";
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
