"use client";

/**
 * Page-loading state for the whole site: the single source of truth.
 *
 * Every way of changing page reports here — a click on <Link> (see
 * src/components/link.tsx), useNavigate() below for push and replace, and
 * leavePage()/onLeaveClick for jumps to another document — and
 * <NavigationProgress /> in the root layout draws the one loader for all of them.
 * A refresh keeps the same page, so it is not shown: the button that asked for
 * it already shows its own "Saving…" state.
 * ESLint blocks importing next/link or useRouter anywhere else, so a new page
 * or panel tab is covered without extra work.
 *
 * Nothing here touches the server: it only reflects navigations the router is
 * already doing.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useSyncExternalStore, useTransition } from "react";
import type { MouseEvent } from "react";

/** Below this, a navigation counts as instant: no loader appears and none finishes. */
const SHOW_AFTER_MS = 120;
/** How long a visible loader takes to fade out once the page is in. */
const FINISH_MS = 300;
/** A navigation nothing can report the end of is dropped after this, so the loader never sticks. */
const DETACHED_GIVE_UP_MS = 10_000;

type Phase = "idle" | "busy" | "done";

/** How many navigations are in flight. Only ever changed in start/stop pairs. */
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
  // A navigation shorter than SHOW_AFTER_MS never showed the loader, so it has nothing to finish.
  if (Date.now() - startedAt < SHOW_AFTER_MS) return setPhase("idle");
  setPhase("done");
  finishTimer = setTimeout(() => setPhase("idle"), FINISH_MS);
}

/**
 * Navigations started by a click rather than a transition: a <Link> click, or
 * a jump to another document. They end when the route changes, when a page
 * left for another document comes back from the browser's back/forward cache,
 * or after DETACHED_GIVE_UP_MS.
 */
const detached = new Set<() => void>();

function startDetached() {
  start();
  const finish = () => {
    if (!detached.delete(finish)) return;
    clearTimeout(timer);
    stop();
  };
  const timer = setTimeout(finish, DETACHED_GIVE_UP_MS);
  detached.add(finish);
}

function endDetached() {
  for (const finish of [...detached]) finish();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentPhase = () => phase;
const idleOnServer = (): Phase => "idle";
const currentRoute = () => window.location.pathname + window.location.search;

/** Counts one navigation for as long as `pending` is true, and always undoes it. */
function usePendingSignal(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    start();
    return stop;
  }, [pending]);
}

/**
 * A click the browser will follow in this tab. Clicks that open a new tab or
 * window, or that a handler cancelled, leave this page where it is.
 */
function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.currentTarget.target;
  return !target || target === "_self";
}

/** True when following `href` would change the route; a link to the current page never does. */
function leadsElsewhere(href: string) {
  const target = new URL(href, window.location.href);
  return target.origin === window.location.origin && target.pathname + target.search !== currentRoute();
}

/**
 * onClick for the site's <Link>: starts the loader at the click itself.
 *
 * The loader is not tied to the link's own state because a link can be gone in
 * the same render its navigation starts — a dropdown or phone menu closes as
 * it is clicked. It ends when the route changes (RouteWatcher).
 */
export function onNavigateClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (isPlainClick(event) && leadsElsewhere(href)) startDetached();
}

/** Starts the loader for a jump to another document; it runs until the browser unloads this page. */
export function leavePage() {
  startDetached();
}

/** onClick for a plain <a> that leaves this app (the portal, for example). */
export function onLeaveClick(event: MouseEvent<HTMLAnchorElement>) {
  if (isPlainClick(event)) leavePage();
}

/**
 * The router, with every page change shown on the loader.
 *
 * Each call runs inside a transition, so `pending` stays true until the new
 * page (or the refreshed data) has rendered; React resets it on its own, so the
 * loader cannot stay stuck. refresh() has its own transition that the loader
 * does not watch, since the page does not change.
 */
export function useNavigate() {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  usePendingSignal(navigating);
  const pending = navigating || refreshing;

  return useMemo(
    () => ({
      pending,
      push: (href: string) => startNavigation(() => router.push(href)),
      replace: (href: string) => startNavigation(() => router.replace(href)),
      refresh: () => startRefresh(() => router.refresh()),
      /** Leaves this app (e.g. for the portal): the loader runs until the browser unloads the page. */
      assign: (url: string) => {
        leavePage();
        window.location.href = url;
      },
    }),
    [router, pending],
  );
}

/** Ends detached navigations whenever the route actually changes. */
function RouteWatcher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(endDetached, [pathname, search]);
  return null;
}

/**
 * Three bouncing balls in the middle of the screen. Mounted once, in the root layout.
 *
 * They fade in only after SHOW_AFTER_MS (the delay is in CSS), so fast
 * navigations never flash them; when a visible one ends they fade out. The
 * page behind stays as it is and clickable.
 */
export function NavigationProgress() {
  const current = useSyncExternalStore(subscribe, currentPhase, idleOnServer);

  useEffect(() => {
    // A page left for another document can come back from the back/forward
    // cache with its loader still running; it has arrived, so end it.
    const onShow = (event: PageTransitionEvent) => event.persisted && endDetached();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <>
      <div className={`page-loader${current === "idle" ? "" : ` is-${current}`}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="visually-hidden" role="status">
        {current === "busy" ? "Loading page…" : ""}
      </span>
      {/* useSearchParams needs a Suspense boundary to keep static pages static. */}
      <Suspense fallback={null}>
        <RouteWatcher />
      </Suspense>
    </>
  );
}
