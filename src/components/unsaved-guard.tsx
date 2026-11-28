"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/components/loading/navigation";

export type UnsavedGuardOptions = {
  /** Whether the form currently has unsaved edits. */
  dirty: boolean;
  /** Disables dialog buttons while a save/action is already running. */
  busy?: boolean;
  /** Dialog heading (defaults to "Unsaved changes"). */
  title?: string;
  /** Dialog body copy. */
  message?: string;
  /** Form-specific save button label (e.g. "Save draft", "Save changes & close"). */
  saveLabel: string;
  /** Form-specific discard button label (defaults to "Discard changes"). */
  discardLabel?: string;
  /** Stay-on-form button label (defaults to "Keep editing"). */
  keepLabel?: string;
  /** Runs the form's own save; return true if saved cleanly, false if validation/API failed. */
  onSave: () => Promise<boolean> | boolean;
  /** Optional cleanup when the user chooses to discard changes. */
  onDiscard?: () => void;
  /** Intercept in-app <a href> clicks while dirty (default: true). */
  interceptLinks?: boolean;
  /** Intercept browser Back button (popstate) while dirty (default: true). */
  interceptBack?: boolean;
};

/**
 * Shared SSOT unsaved-changes guard for admin forms.
 * Reuses the existing `.homepage-unsaved-backdrop` / `.homepage-unsaved-dialog` UI in globals.css.
 */
export function useUnsavedGuard({
  dirty,
  busy = false,
  title = "Unsaved changes",
  message = "Your changes are not saved yet. What would you like to do?",
  saveLabel,
  discardLabel = "Discard changes",
  keepLabel = "Keep editing",
  onSave,
  onDiscard,
  interceptLinks = true,
  interceptBack = true,
}: UnsavedGuardOptions) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const pendingRef = useRef<(() => void) | null>(null);
  const guardPushedRef = useRef(false);
  const bypassPopRef = useRef(false);
  const leavingByLinkRef = useRef(false);

  const onSaveRef = useRef(onSave);
  const onDiscardRef = useRef(onDiscard);
  useEffect(() => {
    onSaveRef.current = onSave;
    onDiscardRef.current = onDiscard;
  });

  const openWith = useCallback((proceed: () => void, viaLink = false) => {
    leavingByLinkRef.current = viaLink;
    pendingRef.current = proceed;
    setOpen(true);
  }, []);

  const guard = useCallback((proceed: () => void) => {
    if (!dirty) {
      proceed();
      return;
    }
    openWith(proceed, false);
  }, [dirty, openWith]);

  // Browser tab-close / hard-refresh safety net (browser security restricts custom UI here).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Intercept in-app <a href> navigation clicks while dirty.
  useEffect(() => {
    if (!dirty || !interceptLinks) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!anchor) return;
      const target = anchor.getAttribute("target");
      const rawHref = anchor.getAttribute("href") || "";
      if ((target && target !== "_self") || anchor.hasAttribute("download") || !rawHref || rawHref.startsWith("#")) return;
      if (rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      openWith(() => {
        if (url.origin === window.location.origin) {
          navigate.push(url.pathname + url.search + url.hash);
        } else {
          window.location.assign(url.href);
        }
      }, true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, interceptLinks, openWith, navigate]);

  // Intercept browser Back button (popstate) while dirty.
  useEffect(() => {
    if (!dirty || !interceptBack) {
      if (!dirty && guardPushedRef.current && !leavingByLinkRef.current && window.history.state?.__unsavedGuard) {
        guardPushedRef.current = false;
        bypassPopRef.current = true;
        window.history.back();
      }
      return;
    }
    if (!guardPushedRef.current && !window.history.state?.__unsavedGuard) {
      window.history.pushState({ ...(window.history.state || {}), __unsavedGuard: true }, "", window.location.href);
      guardPushedRef.current = true;
    }
    const onPop = (event: PopStateEvent) => {
      if (bypassPopRef.current) {
        bypassPopRef.current = false;
        return;
      }
      event.stopImmediatePropagation();
      window.history.pushState({ ...(window.history.state || {}), __unsavedGuard: true }, "", window.location.href);
      guardPushedRef.current = true;
      openWith(() => {
        guardPushedRef.current = false;
        bypassPopRef.current = true;
        window.history.go(-2);
      }, false);
    };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, [dirty, interceptBack, openWith]);

  // Close dialog on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working && !busy) {
        event.preventDefault();
        event.stopImmediatePropagation();
        leavingByLinkRef.current = false;
        pendingRef.current = null;
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, working, busy]);

  async function handleSave() {
    if (working || busy) return;
    setWorking(true);
    try {
      const ok = await onSaveRef.current();
      setOpen(false);
      if (ok) {
        const proceed = pendingRef.current;
        pendingRef.current = null;
        proceed?.();
      } else {
        leavingByLinkRef.current = false;
        pendingRef.current = null;
      }
    } finally {
      setWorking(false);
    }
  }

  function handleDiscard() {
    if (working || busy) return;
    setOpen(false);
    onDiscardRef.current?.();
    const proceed = pendingRef.current;
    pendingRef.current = null;
    proceed?.();
  }

  function handleKeep() {
    if (working || busy) return;
    leavingByLinkRef.current = false;
    pendingRef.current = null;
    setOpen(false);
  }

  const disabled = working || busy;
  const dialog = open ? (
    <div className="homepage-unsaved-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) handleKeep(); }}>
      <div className="homepage-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-guard-title">
        <h2 id="unsaved-guard-title">{title}</h2>
        <p>{message}</p>
        <div>
          <button className="admin-button" type="button" disabled={disabled} onClick={() => void handleSave()}>
            {working ? "Saving…" : saveLabel}
          </button>
          <button className="admin-action" type="button" disabled={disabled} onClick={handleDiscard}>
            {discardLabel}
          </button>
          <button className="admin-action" type="button" disabled={disabled} onClick={handleKeep}>
            {keepLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { guard, dialog };
}
