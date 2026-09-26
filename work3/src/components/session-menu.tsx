"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/repo/types";

type SessionUser = { displayName: string; username: string; role: Role };

export function SessionMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <Link className="session-link" href="/login">
        Sign in
      </Link>
    );
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const staff = user.role !== "member";

  return (
    <div className="session-menu">
      <button type="button" className="session-trigger" onClick={() => setOpen(value => !value)}>
        <b>{user.displayName}</b>
        <small>{user.role}</small>
      </button>
      {open ? (
        <div className="session-dropdown">
          <Link href={`/members/${user.username}`} onClick={() => setOpen(false)}>
            My profile
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
