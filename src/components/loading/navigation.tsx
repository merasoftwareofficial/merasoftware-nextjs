"use client";

/**
 * Loading state for the whole site: the single source of truth.
 *
 * Two loaders, drawn by <NavigationProgress /> in the root layout:
 *
 * - The line at the top, for a page change. Every way of changing page reports
 *   here — a click on <Link> (see src/components/link.tsx), useNavigate() below
 *   for push and replace, and leavePage()/onLeaveClick for jumps to another
 *   document. ESLint blocks importing next/link or useRouter anywhere else, so
 *   a new page or panel tab is covered without extra work.
 * - The balls over a dimmed screen, for work the user waits for on the same
 *   page: a save, an upload, a sign-in (useTask() below), and the refresh()
 *   that reloads the page's data after it.
 *
 * Only one shows at a time: while a page is changing, the line alone says so.
 *
 * Nothing here touches the server: it only reflects work already happening.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { MouseEvent } from "react";

/** Below this, a navigation or task counts as instant: no loader appears and none finishes. */
const SHOW_AFTER_MS = 120;
/** How long a visible loader takes to fade out once the work is done. */
const FINISH_MS = 300;
/**
 * How long a loader waits, once its work is done, for the next piece to pick
 * it up — a save is followed by the refresh() it asked for, a link click by
 * the route change — so it runs on instead of fading out and back in.
 */
const HANDOFF_MS = 100;
/** A navigation nothing can report the end of is dropped after this, so the loader never sticks. */
const DETACHED_GIVE_UP_MS = 10_000;

type Phase = "idle" | "busy" | "done";

/**
 * One loader's state. start() and stop() are only ever called in pairs; the
 * loader is busy while any pair is open.
 */
function createLoader() {
  let inFlight = 0;
  let phase: Phase = "idle";
  let startedAt = 0;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function setPhase(next: Phase) {
    phase = next;
    for (const listener of listeners) listener();
  }

  return {
    start() {
      inFlight++;
      if (inFlight > 1) return;
      clearTimeout(finishTimer);
      // Picked up within HANDOFF_MS: the same run goes on.
      if (phase === "busy") return;
      startedAt = Date.now();
      setPhase("busy");
    },
    stop() {
      inFlight--;
      if (inFlight > 0) return;
      // Work shorter than SHOW_AFTER_MS never showed the loader, so it has nothing to finish or hand on.
      if (Date.now() - startedAt < SHOW_AFTER_MS) return setPhase("idle");
      finishTimer = setTimeout(() => {
        setPhase("done");
        finishTimer = setTimeout(() => setPhase("idle"), FINISH_MS);
      }, HANDOFF_MS);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    current: () => phase,
  };
}

type Loader = ReturnType<typeof createLoader>;

/** Page changes: the line. */
const pages = createLoader();
/** Work on the current page: the balls. */
const tasks = createLoader();

/**
 * Navigations started by a click rather than a transition: a <Link> click, or
 * a jump to another document. They end when the route changes, when a page
 * left for another document comes back from the browser's back/forward cache,
 * or after DETACHED_GIVE_UP_MS.
 */
const detached = new Set<() => void>();

function startDetached() {
  pages.start();
  const finish = () => {
    if (!detached.delete(finish)) return;
    clearTimeout(timer);
    pages.stop();
  };
  const timer = setTimeout(finish, DETACHED_GIVE_UP_MS);
  detached.add(finish);
}

function endDetached() {
  for (const finish of [...detached]) finish();
}

const idleOnServer = (): Phase => "idle";
const currentRoute = () => window.location.pathname + window.location.search;

/** Counts one piece of work on `loader` for as long as `pending` is true, and always undoes it. */
function usePendingSignal(loader: Loader, pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    loader.start();
    return loader.stop;
  }, [loader, pending]);
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
 * The router, with every call shown on a loader: push and replace on the line,
 * refresh on the balls, since the page stays the same while its data reloads.
 *
 * Each call runs inside a transition, so `pending` stays true until the new
 * page (or the refreshed data) has rendered; React resets it on its own, so the
 * loader cannot stay stuck.
 */
export function useNavigate() {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  usePendingSignal(pages, navigating);
  usePendingSignal(tasks, refreshing);
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

/**
 * Work the user waits for on this page — a save, an upload, a sign-in. `busy`
 * is for the component's own buttons; the balls show the same work to the
 * whole screen, so both come from here.
 *
 * track() ends both however the work ends: it resolves, it throws, or the
 * component is gone. Errors reach the caller unchanged. A refresh() called
 * inside the work carries the balls on until the new data is in.
 */
export function useTask() {
  const [busy, setBusy] = useState(false);

  const track = useCallback(async function track<T>(work: () => Promise<T>): Promise<T> {
    setBusy(true);
    tasks.start();
    try {
      return await work();
    } finally {
      tasks.stop();
      setBusy(false);
    }
  }, []);

  return { busy, track };
}

/** Ends detached navigations whenever the route actually changes. */
function RouteWatcher() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(endDetached, [pathname, search]);
  return null;
}

/**
 * Both loaders, mounted once in the root layout: the line across the top for a
 * page change, and three bouncing balls over a dimmed screen for work on the
 * page. While a page is changing only the line shows, so a save that ends in a
 * page change (publish, sign-in, sign-out) hands over from balls to line.
 *
 * Each fades in only after SHOW_AFTER_MS (the delay is in CSS), so fast work
 * never flashes it; when a visible one ends it fades out. The page behind
 * stays as it is and clickable.
 */
export function NavigationProgress() {
  const page = useSyncExternalStore(pages.subscribe, pages.current, idleOnServer);
  const task = useSyncExternalStore(tasks.subscribe, tasks.current, idleOnServer);
  const balls = page === "idle" ? task : "idle";

  useEffect(() => {
    // A page left for another document can come back from the back/forward
    // cache with its loader still running; it has arrived, so end it.
    const onShow = (event: PageTransitionEvent) => event.persisted && endDetached();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  return (
    <>
      <div className={`nav-progress${page === "idle" ? "" : ` is-${page}`}`} aria-hidden="true" />
      <div className={`page-loader${balls === "idle" ? "" : ` is-${balls}`}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <span className="visually-hidden" role="status">
        {page === "busy" ? "Loading page…" : balls === "busy" ? "Working…" : ""}
      </span>
      {/* useSearchParams needs a Suspense boundary to keep static pages static. */}
      <Suspense fallback={null}>
        <RouteWatcher />
      </Suspense>
    </>
  );
}
