"use client";

import Link from "@/components/link";
import { onLeaveClick, useNavigate, useTask } from "@/components/loading/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Role } from "@/lib/repo/types";

type SessionUser = { displayName: string; username: string; role: Role; badge: string };
type PortalEntry = { label: string; href: string };
type SessionState = { user: SessionUser | null; portal: PortalEntry | null };

const SESSION_CACHE_KEY = "ms_header_session_v1";
const SESSION_CHANGED_EVENT = "ms:session-changed";
const SESSION_CACHE_TTL_MS = 5 * 60_000;

/** Clears cached header session and notifies mounted SessionMenu instances to re-check `/api/auth`. */
export function notifySessionChanged() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* ignore storage errors */ }
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

function cameFromExternalOrigin(): boolean {
  if (typeof document === "undefined" || !document.referrer) return false;
  try {
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function SessionMenu({
  user: initialUser = null,
  portal: initialPortal = null,
  portalApiUrl,
}: {
  user?: SessionUser | null;
  portal?: PortalEntry | null;
  portalApiUrl: string;
}) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionState>({ user: initialUser, portal: initialPortal });
  const dropdownId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Pointer that started the last click. A mouse opens the menu by hovering,
  // so its click must not toggle it shut; touch and keyboard still toggle.
  const lastPointer = useRef("");

  useEffect(() => {
    if (initialUser) return;
    let activeController: AbortController | null = null;

    const loadSession = (forceFresh: boolean) => {
      if (!forceFresh) {
        try {
          const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as SessionState & { expiresAt?: number };
            const staleGuestFromExternal = !parsed.user && cameFromExternalOrigin();
            if (!staleGuestFromExternal && parsed.expiresAt && parsed.expiresAt > Date.now()) {
              setSession({ user: parsed.user ?? null, portal: parsed.portal ?? null });
              return;
            }
          }
        } catch { /* ignore storage errors */ }
      }

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      fetch("/api/auth", { cache: "no-store", signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: SessionState | null) => {
          if (!data || controller.signal.aborted) return;
          const next = { user: data.user ?? null, portal: data.portal ?? null };
          setSession(next);
          try {
            sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...next, expiresAt: Date.now() + SESSION_CACHE_TTL_MS }));
          } catch { /* ignore storage errors */ }
        })
        .catch(() => undefined);
    };

    const onSessionChanged = () => loadSession(true);
    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    loadSession(false);

    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
      activeController?.abort();
    };
  }, [initialUser]);

  const { user, portal } = session;

  if (!user) {
    return (
      <Link className="session-link" href="/login">
        Sign in
      </Link>
    );
  }

  const signOut = () =>
    track(async () => {
      // The portal owns the shared cookie, so signing out here signs out of the portal too.
      await fetch(`${portalApiUrl}/api/userLogout`, { credentials: "include" });
      notifySessionChanged();
      setSession({ user: null, portal: null });
      setOpen(false);
      router.push("/");
      router.refresh();
    });

  const staff = user.role !== "member";

  return (
    <div
      className="session-menu"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
      onPointerEnter={event => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={event => {
        if (event.pointerType === "mouse") setOpen(false);
      }}
    >
      <button
        type="button"
        className="session-trigger"
        ref={triggerRef}
        aria-controls={open ? dropdownId : undefined}
        aria-expanded={open}
        onPointerDown={event => {
          lastPointer.current = event.pointerType;
        }}
        onClick={() => {
          const mouse = lastPointer.current === "mouse";
          lastPointer.current = "";
          setOpen(value => (mouse ? true : !value));
        }}
      >
        <b>{user.displayName}</b>
        <small>{user.badge}</small>
      </button>
      {open ? (
        <div className="session-dropdown" id={dropdownId}>
          {portal ? (
            <>
              <p className="session-group">Portal</p>
              {/* A full page load: the portal is another app on the same shared cookie. */}
              <a href={portal.href} onClick={onLeaveClick}>
                {portal.label}
              </a>
              <p className="session-group">Website</p>
            </>
          ) : null}
          <Link href="/account" onClick={() => setOpen(false)}>
            My Account
          </Link>
          {staff ? (
            <Link href="/admin" onClick={() => setOpen(false)}>
              Control Panel
            </Link>
          ) : null}
          <button type="button" onClick={signOut} disabled={busy}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
