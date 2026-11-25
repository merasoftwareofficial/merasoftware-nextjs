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

type CachedSession = SessionState & { expiresAt?: number };

function readCachedSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSession;
    return { user: parsed.user ?? null, portal: parsed.portal ?? null, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeCachedSession(next: SessionState) {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...next, expiresAt: Date.now() + SESSION_CACHE_TTL_MS }));
  } catch {
    /* ignore storage errors */
  }
}

/** Clears cached header session and notifies mounted SessionMenu instances to re-check `/api/auth`. */
export function notifySessionChanged() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(SESSION_CACHE_KEY); } catch { /* ignore storage errors */ }
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
  const [mounted, setMounted] = useState(Boolean(initialUser));
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
        const cached = readCachedSession();
        if (cached) {
          // Restore cached session immediately (stale-while-revalidate) so reopen never flashes "Sign in".
          setSession({ user: cached.user ?? null, portal: cached.portal ?? null });
          setMounted(true);
          const staleGuestFromExternal = !cached.user && cameFromExternalOrigin();
          const fresh = Boolean(cached.expiresAt && cached.expiresAt > Date.now());
          if (!staleGuestFromExternal && fresh) return;
        }
      }
      setMounted(true);

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      fetch("/api/auth", { cache: "no-store", signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: SessionState | null) => {
          if (!data || controller.signal.aborted) return;
          const next = { user: data.user ?? null, portal: data.portal ?? null };
          setSession(next);
          writeCachedSession(next);
        })
        .catch(() => undefined);
    };

    const onSessionChanged = () => loadSession(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_CACHE_KEY) return;
      if (!event.newValue) {
        setSession({ user: null, portal: null });
        return;
      }
      const cached = readCachedSession();
      if (cached) setSession({ user: cached.user ?? null, portal: cached.portal ?? null });
    };

    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    window.addEventListener("storage", onStorage);
    loadSession(false);

    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
      window.removeEventListener("storage", onStorage);
      activeController?.abort();
    };
  }, [initialUser]);

  const { user, portal } = session;

  if (!mounted) {
    return <span className="session-link session-loading" aria-hidden="true" />;
  }

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
      const signedOut = { user: null, portal: null };
      writeCachedSession(signedOut);
      setSession(signedOut);
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
