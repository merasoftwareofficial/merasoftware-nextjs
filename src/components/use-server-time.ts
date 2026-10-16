"use client";
import { useEffect, useState } from "react";

// One clock and one request lifecycle shared by all countdowns on the page.
const listeners = new Set<(now: number | null) => void>();
let anchor: { server: number; monotonic: number } | null = null;
let controller: AbortController | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
function tick() {
  const now = anchor ? anchor.server + performance.now() - anchor.monotonic : null;
  listeners.forEach(listener => listener(now));
}
async function sync() {
  if (controller) return;
  const current = new AbortController(); controller = current;
  const timeout = setTimeout(() => current.abort(), 10000);
  const start = performance.now();
  try {
    const response = await fetch("/api/time", { cache: "no-store", signal: current.signal });
    if (!response.ok) throw new Error("Clock unavailable");
    const { now } = await response.json();
    if (!Number.isFinite(now) || current.signal.aborted) return;
    anchor = { server: now + (performance.now() - start) / 2, monotonic: performance.now() };
    tick();
  } catch { /* Keep an established clock; first-load failures show the fixed IST deadline. */ }
  finally { clearTimeout(timeout); if (controller === current) controller = null; }
}
function onVisible() { if (document.visibilityState === "visible") void sync(); }
export function useServerTime() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    listeners.add(setNow);
    if (listeners.size === 1) {
      void sync(); timer = setInterval(tick, 1000); syncTimer = setInterval(() => void sync(), 60000);
      document.addEventListener("visibilitychange", onVisible);
    }
    tick();
    return () => {
      listeners.delete(setNow);
      if (!listeners.size) {
        if (timer) clearInterval(timer); if (syncTimer) clearInterval(syncTimer);
        document.removeEventListener("visibilitychange", onVisible);
        controller?.abort(); controller = null; anchor = null;
      }
    };
  }, []);
  return now;
}
