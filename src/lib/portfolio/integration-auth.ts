import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AuthError } from "@/lib/auth";
export function requirePortfolioIntegration(request: Request) {
  const secret = process.env.PORTFOLIO_INTEGRATION_SECRET;
  if (!secret || secret.length < 32) throw new AuthError("Portfolio integration is not configured.", 503);
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AuthError("Unauthorized integration.", 401);
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  // Next's standalone server can normalize request.url to localhost. Host is
  // the browser-facing authority; browsers cannot override it on a cross-site fetch.
  const target = new URL(request.url);
  target.host = request.headers.get("host") ?? target.host;
  if (origin !== target.origin) throw new AuthError("Invalid request origin.", 403);
}
