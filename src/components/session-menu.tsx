"use client";

import Link from "@/components/link";
import { onLeaveClick, useNavigate, useTask } from "@/components/loading/navigation";
import { useId, useRef, useState } from "react";
import type { Role } from "@/lib/repo/types";

type SessionUser = { displayName: string; username: string; role: Role; badge: string };
type PortalEntry = { label: string; href: string };

export function SessionMenu({
  user,
  portal,
  portalApiUrl,
}: {
  user: SessionUser | null;
  portal: PortalEntry | null;
  portalApiUrl: string;
}) {
  const router = useNavigate();
  const { busy, track } = useTask();
  const [open, setOpen] = useState(false);
  const dropdownId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Pointer that started the last click. A mouse opens the menu by hovering,
  // so its click must not toggle it shut; touch and keyboard still toggle.
  const lastPointer = useRef("");

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
