"use client";
import { useCallback, useEffect, useState } from "react";
import type { WhatsappStatus } from "@/lib/whatsapp-types";

export async function whatsappApi<T>(path: string, method = "GET", signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`/api/whatsapp/${path}`, {
    method, signal, cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not complete the WhatsApp request.");
  return result.data as T;
}

export const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const QR_POLL_MS = 5_000;
const IDLE_POLL_MS = 120_000;

/**
 * Shared WhatsApp status loader and low-frequency poller for admin panels.
 * Uses 5s polling only while actively scanning a QR code; otherwise 2 min when visible,
 * plus automatic refresh on tab focus and manual refresh().
 */
export function useWhatsappStatus({
  active,
  allowQrFastPoll = false,
  errorFallback = "Could not load WhatsApp status.",
}: {
  active: boolean;
  allowQrFastPoll?: boolean;
  errorFallback?: string;
}) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback((signal?: AbortSignal) => {
    setRefreshing(true);
    return whatsappApi<WhatsappStatus>("status", "GET", signal)
      .then((data) => { if (!signal?.aborted) { setStatus(data); setStatusError(null); } })
      .catch((error) => { if (!signal?.aborted) setStatusError(message(error, errorFallback)); })
      .finally(() => { if (!signal?.aborted) setRefreshing(false); });
  }, [errorFallback]);

  const pollMs = allowQrFastPoll && status?.connection === "qr" ? QR_POLL_MS : IDLE_POLL_MS;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const refreshVisible = () => { if (document.visibilityState === "visible") void loadStatus(controller.signal); };
    const first = setTimeout(refreshVisible, 0);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { controller.abort(); clearTimeout(first); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [active, loadStatus]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void loadStatus(controller.signal); }, pollMs);
    return () => { controller.abort(); clearInterval(timer); };
  }, [active, loadStatus, pollMs]);

  const refresh = useCallback(() => { void loadStatus(); }, [loadStatus]);

  return { status, statusError, refreshing, refresh, loadStatus };
}
