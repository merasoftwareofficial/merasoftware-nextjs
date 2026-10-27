import "server-only";
import { cookies } from "next/headers";
import { AuthError, getSession } from "@/lib/auth";
import type { SalesCatalogue } from "./sales-packages";

export async function requireSalesAdmin() {
  const session = await getSession();
  if (!session) throw new AuthError("Sign in to continue.", 401);
  if (!session.portalRoles.includes("admin") || session.portalActiveRole !== "admin") throw new AuthError("Switch to your portal admin role to manage prices and packages.", 403);
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
