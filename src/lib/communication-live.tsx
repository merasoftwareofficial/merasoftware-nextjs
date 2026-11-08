"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

function createFeed(url: string | null) {
  const listeners = new Map<() => void, string[]>();
  const changedDomains = new Set<string>();
  let refreshAll = false;
  let source: EventSource | null = null, retry: ReturnType<typeof setTimeout> | null = null;
  let batch: ReturnType<typeof setTimeout> | null = null;
  const feed = { connected: false, subscribe };
  function disconnect() {
    source?.close(); source = null; feed.connected = false;
    if (retry) clearTimeout(retry); retry = null;
    if (batch) clearTimeout(batch); batch = null; changedDomains.clear(); refreshAll = false;
  }
  function notify(domains?: string[]) {
    if (domains) for (const domain of domains) changedDomains.add(domain);
    else refreshAll = true;
    if (batch) return;
    batch = setTimeout(() => {
      batch = null;
      const changed = [...changedDomains], all = refreshAll;
      changedDomains.clear(); refreshAll = false;
      for (const [listener, domains] of listeners) if (all || domains.some(domain => changed.includes(domain))) listener();
    }, 200);
  }
  function connect() {
    if (!url || source || !listeners.size || document.hidden || typeof EventSource === "undefined") return;
    const current = new EventSource(url, { withCredentials: true }); source = current;
    current.onmessage = event => {
      if (source !== current) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "denied") { disconnect(); return; }
      if (message.type === "unavailable") { failed(); return; }
      if (message.type === "ready") { feed.connected = true; notify(); }
      else if (message.type === "resync") notify();
      else if (message.resources?.length) notify(message.resources.map((entry: { domain: string }) => entry.domain));
    };
    current.onerror = () => { if (source === current) failed(); };
  }
  function failed() { disconnect(); if (listeners.size) retry = setTimeout(() => { retry = null; connect(); }, 5000); }
  function visible() {
    if (document.hidden) disconnect();
    else {
      connect();
      // A panel may have mounted while hidden. Reconcile even for website-only
      // admins/no feed; event-only panels have no polling timer to rescue them.
      notify();
    }
  }
  function subscribe(listener: () => void, domains = ["communication"]) {
    listeners.set(listener, domains);
    if (listeners.size === 1) { document.addEventListener("visibilitychange", visible); window.addEventListener("online", visible); }
    connect();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) { disconnect(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); }
    };
  }
  return feed;
}
const unavailable = createFeed(null);
const FeedContext = createContext(unavailable);
export function CommunicationLiveProvider({ url, children }: { url: string | null; children: ReactNode }) {
  const feed = useMemo(() => createFeed(url), [url]);
  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}

// No response storage. One active read and one coalesced follow-up per mounted
// panel. Old polling remains only when the authorized transport is unavailable.
export function useCommunicationRefresh(load: (signal: AbortSignal) => Promise<unknown>, active: boolean, fallbackMs = 5000, identity = "", resources = "communication") {
  const feed = useContext(FeedContext);
  const callback = useRef(load);
  useEffect(() => { callback.current = load; }, [load]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let pending = false, again = false;
    const refresh = async () => {
      if (document.hidden || controller.signal.aborted) return;
      if (pending) { again = true; return; }
      pending = true;
      try {
        do { again = false; await callback.current(controller.signal); } while (again && !controller.signal.aborted);
      } catch { /* each caller owns its visible read error */ }
      finally { pending = false; }
    };
    const unsubscribe = feed.subscribe(() => { void refresh(); }, resources.split(","));
    void refresh();
    const timer = fallbackMs ? setInterval(() => { if (!feed.connected) void refresh(); }, fallbackMs) : null;
    return () => { controller.abort(); unsubscribe(); if (timer) clearInterval(timer); };
  }, [active, feed, fallbackMs, identity, resources]);
}
