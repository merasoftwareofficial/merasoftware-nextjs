"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  async function signOut() {
    // The portal owns the shared cookie, so signing out here signs out of the portal too.
    await fetch(`${portalApiUrl}/api/userLogout`, { credentials: "include" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const staff = user.role !== "member";

  return (
    <div
      className="session-menu"
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
        aria-haspopup="menu"
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
        <div className="session-dropdown">
          {portal ? (
            <>
              <p className="session-group">Portal</p>
              {/* A full page load: the portal is another app on the same shared cookie. */}
              <a href={portal.href}>{portal.label}</a>
              <p className="session-group">Website</p>
            </>
          ) : null}
          <Link href={`/members/${user.username}`} onClick={() => setOpen(false)}>
            My profile
          </Link>
          <Link href="/account/posts" onClick={() => setOpen(false)}>
            My posts
          </Link>
          <Link href="/account/saved" onClick={() => setOpen(false)}>
            Saved posts
          </Link>
          <Link href="/community/write" onClick={() => setOpen(false)}>
            Write a post
          </Link>
          {staff ? (
            <Link href="/admin" onClick={() => setOpen(false)}>
              Management panel
            </Link>
          ) : null}
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
