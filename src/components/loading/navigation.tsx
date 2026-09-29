"use client";

/**
 * Page-loading state for the whole site: the single source of truth.
 *
 * Every way of changing page reports here — a click on <Link> (see
 * src/components/link.tsx) and useNavigate() below for push, replace, refresh
 * and full-page jumps — and <NavigationProgress /> in the root layout draws the
 * one bar for all of them. ESLint blocks importing next/link or useRouter
 * anywhere else, so a new page or panel tab is covered without extra work.
 *
 * Nothing here touches the server: it only reflects navigations the router is
 * already doing.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";

/** Below this, a navigation counts as instant: no bar appears and none finishes. */
const SHOW_AFTER_MS = 120;
/** How long a visible bar takes to run to full width and fade once the page is in. */
const FINISH_MS = 300;

type Phase = "idle" | "busy" | "done";

/** How many navigations are in flight. Only ever changed in pairs by usePendingSignal. */
let inFlight = 0;
let phase: Phase = "idle";
let startedAt = 0;
let finishTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setPhase(next: Phase) {
  phase = next;
  for (const listener of listeners) listener();
}

function start() {
  inFlight++;
  if (inFlight > 1) return;
  clearTimeout(finishTimer);
  startedAt = Date.now();
  setPhase("busy");
}

function stop() {
  inFlight--;
  if (inFlight > 0) return;
  // A navigation shorter than SHOW_AFTER_MS never showed the bar, so it has nothing to finish.
  if (Date.now() - startedAt < SHOW_AFTER_MS) return setPhase("idle");
  setPhase("done");
  finishTimer = setTimeout(() => setPhase("idle"), FINISH_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentPhase = () => phase;
const idleOnServer = (): Phase => "idle";

/** Counts one navigation for as long as `pending` is true, and always undoes it. */
export function usePendingSignal(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    start();
    return stop;
  }, [pending]);
}

/** A jump to another document (another site, or a hard load) cannot report its end. */
const FULL_PAGE_GIVE_UP_MS = 10_000;

/**
 * The router, with every navigation shown on the loading bar.
 *
 * Each call runs inside a transition, so `pending` stays true until the new
 * page (or the refreshed data) has rendered; React resets it on its own, so the
 * bar cannot stay stuck.
 */
export function useNavigate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  usePendingSignal(pending || leaving);

  useEffect(() => {
    if (!leaving) return;
    // Normally the page unloads first; this only clears the bar if it does not.
    const timer = setTimeout(() => setLeaving(false), FULL_PAGE_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return useMemo(
    () => ({
      pending,
      push: (href: string) => startTransition(() => router.push(href)),
      replace: (href: string) => startTransition(() => router.replace(href)),
      refresh: () => startTransition(() => router.refresh()),
      /** Leaves this app (e.g. for the portal): the bar runs until the browser unloads the page. */
      assign: (url: string) => {
        setLeaving(true);
        window.location.href = url;
      },
    }),
    [router, pending],
  );
}

/**
 * The bar at the top of every page. Mounted once, in the root layout.
 *
 * It fades in only after SHOW_AFTER_MS (the delay is in CSS), so fast
 * navigations never flash it; when a visible one ends it runs to full width
 * and fades out.
 */
export function NavigationProgress() {
  const current = useSyncExternalStore(subscribe, currentPhase, idleOnServer);
  return (
    <>
      <div className={`nav-progress${current === "idle" ? "" : ` is-${current}`}`} aria-hidden="true" />
      <span className="visually-hidden" role="status">
        {current === "busy" ? "Loading page…" : ""}
      </span>
    </>
  );
}
