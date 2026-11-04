import "server-only";
import { cookies } from "next/headers";
import { AuthError, requirePortalAdmin } from "@/lib/auth";
import { PORTAL_COOKIE } from "@/lib/portal";

// The project's live URL lives in the portal order (projectLink): the client's
// "View website" button, screenshots and the public case study all read it.
// Saved through the portal's own admin endpoint with the admin's session.
export async function savePortalProjectLink(orderId: string, projectLink: string, captureAllowed: boolean): Promise<string> {
  await requirePortalAdmin("change a project's live website URL");
  const origin = process.env.PORTAL_API_URL;
  if (!origin) throw new AuthError("Portal API is not configured.", 503);
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/admin/projects/${orderId}/portfolio-source`, {
    method: "PATCH", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", cookie: `${PORTAL_COOKIE}=${(await cookies()).get(PORTAL_COOKIE)?.value ?? ""}` },
    body: JSON.stringify({ projectLink, captureAllowed }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new AuthError(result.message || "The portal could not save the website URL. Please try again.", response.status >= 400 ? response.status : 503);
  return String(result.data?.projectLink ?? "");
}
