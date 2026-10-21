import "server-only";
import { createHash, createHmac } from "node:crypto";
import { SignJWT } from "jose";
import { PortalApiError, portalApiRequest } from "./portal-api";

export type EmailApplication = "website" | "portal";
type WebsiteAccess = { access: "admin" | "intake"; actorId?: string };
export { PortalApiError as EmailServiceError };
export async function emailControlRequest<T>(path: string, method = "GET", body?: unknown, authorization?: WebsiteAccess | { cookie: string }): Promise<T> {
  const headers: Record<string, string> = {};
  if (authorization && "cookie" in authorization) {
    headers.Cookie = `token=${authorization.cookie}`;
  } else {
    const secret = process.env.TOKEN_SECRET_KEY;
    if (!secret || !authorization) throw new PortalApiError("Email review service is not configured.");
    // A separate signing key and audience prevent a login token from becoming
    // website-admin access. Method, path and body are all bound to this request.
    const key = createHmac("sha256", secret).update("website-email-control-v1").digest("hex");
    const digest = createHash("sha256").update(JSON.stringify(body || {})).digest("hex");
    let assertion = new SignJWT({ access: authorization.access, method, path, digest })
      .setProtectedHeader({ alg: "HS256" }).setIssuer("merasoftware-website")
      .setAudience("email-control").setIssuedAt().setExpirationTime("60s");
    if (authorization.actorId) assertion = assertion.setSubject(authorization.actorId);
    headers["x-website-email-assertion"] = await assertion.sign(new TextEncoder().encode(key));
  }
  return portalApiRequest<T>("Email review", `/api/email-control${path}`, method, headers, body);
}
