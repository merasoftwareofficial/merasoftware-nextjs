import "server-only";
import { createHash, createHmac } from "node:crypto";
import { SignJWT } from "jose";

export type EmailApplication = "website" | "portal";
type WebsiteAccess = { access: "admin" | "intake"; actorId?: string };
export class EmailServiceError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export async function emailControlRequest<T>(path: string, method = "GET", body?: unknown, authorization?: WebsiteAccess | { cookie: string }): Promise<T> {
  const base = process.env.PORTAL_API_URL?.replace(/\/$/, "");
  if (!base) throw new EmailServiceError("Email review service is not configured.");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization && "cookie" in authorization) {
    headers.Cookie = `token=${authorization.cookie}`;
  } else {
    const secret = process.env.TOKEN_SECRET_KEY;
    if (!secret || !authorization) throw new EmailServiceError("Email review service is not configured.");
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
  let response: Response;
  try {
    response = await fetch(`${base}/api/email-control${path}`, {
      method, headers, cache: "no-store", signal: AbortSignal.timeout(25000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new EmailServiceError("Email review service is unavailable. Please try again."); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new EmailServiceError(result?.message || "Email review request failed.", response.status >= 400 ? response.status : 502);
  return result.data as T;
}
