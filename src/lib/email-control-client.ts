import type { Application } from "./email-control-types";
export async function emailControlApi<T>(application: Application, path = "", method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/api/email-control${path}${separator}application=${application}`, {
    method, signal, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete the email request.");
  return result.data as T;
}
