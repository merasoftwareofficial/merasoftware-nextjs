import "server-only";

/** A portal backend call that failed; `status` is the HTTP status the website should answer with. */
export class PortalApiError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

/**
 * Calls the portal backend (PORTAL_API_URL) and unwraps its `{ success, data, message }` reply.
 * `label` names the service in errors, e.g. "Email review" → "Email review service is unavailable…".
 * Authorization (cookie or signed assertion) is the caller's job.
 */
export async function portalApiRequest<T>(label: string, path: string, method = "GET", headers: Record<string, string> = {}, body?: unknown): Promise<T> {
  const base = process.env.PORTAL_API_URL?.replace(/\/$/, "");
  if (!base) throw new PortalApiError(`${label} service is not configured.`);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method, headers: { "Content-Type": "application/json", ...headers }, cache: "no-store", signal: AbortSignal.timeout(25000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new PortalApiError(`${label} service is unavailable. Please try again.`); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new PortalApiError(result?.message || `${label} request failed.`, response.status >= 400 ? response.status : 502);
  return result.data as T;
}
