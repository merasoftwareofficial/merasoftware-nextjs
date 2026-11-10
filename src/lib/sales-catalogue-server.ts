import "server-only";
import { cookies } from "next/headers";
import { AuthError, requirePortalAdmin } from "@/lib/auth";
import type { SalesCatalogue } from "./sales-packages";

export async function requireSalesAdmin() {
  await requirePortalAdmin("manage prices and packages");
}
export async function salesBackend(admin: boolean, body?: unknown, path = "sales-packages"): Promise<SalesCatalogue | unknown> {
  const origin = process.env.PORTAL_API_URL;
  if (!origin) throw new AuthError("Portal API is not configured.", 503);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (admin) {
    await requireSalesAdmin();
    headers.cookie = `token=${(await cookies()).get("token")?.value ?? ""}`;
  } else {
    const secret = process.env.PORTFOLIO_INTEGRATION_SECRET ?? "";
    if (secret.length < 32) throw new AuthError("Sales integration is not configured.", 503);
    headers.Authorization = `Bearer ${secret}`;
  }
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/${admin ? "admin" : "integration"}/${path}`, {
    method: body ? "PATCH" : "GET", headers, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(20000), ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new AuthError(result.message || "The portal is unavailable. Please try again.", response.status >= 400 ? response.status : 503);
  return result.data;
}
export async function readSalesCatalogue(admin = false) { return await salesBackend(admin) as SalesCatalogue; }

// The portal's add-on service (Additional Features / Upgrades) routes are plain POST / DELETE on /api, not PATCH under
// /api/admin, so they need their own forwarder. Only these three fixed routes can be called; the portal owns every rule
// (admin check, "cannot delete a bought service") and the admin's own cookie is the credential, as everywhere else here.
const ADD_ON_ROUTES = { create: ["POST", "upload-product"], update: ["POST", "update-product"], remove: ["DELETE", "delete-product"] } as const;
export async function portalAddOnRequest(action: keyof typeof ADD_ON_ROUTES, body: Record<string, unknown>): Promise<unknown> {
  const origin = process.env.PORTAL_API_URL;
  if (!origin) throw new AuthError("Portal API is not configured.", 503);
  await requireSalesAdmin();
  const [method, path] = ADD_ON_ROUTES[action];
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/${path}`, {
    method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000), body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", cookie: `token=${(await cookies()).get("token")?.value ?? ""}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new AuthError(result.message || "The portal is unavailable. Please try again.", response.status >= 400 ? response.status : 503);
  return result.data;
}
