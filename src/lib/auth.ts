/**
 * Session and permission layer.
 *
 * Signing in happens against the client portal, which sets its `token` cookie.
 * getSessionUser() turns that cookie into the website's own user record; every
 * page and route reads the session through this file only. See src/lib/portal.ts.
 */

import { cookies } from "next/headers";
import { getPortalAccount, PORTAL_COOKIE, websiteUserFor } from "@/lib/portal";
import type { Role, User } from "@/lib/repo";

export type { Role, User };

/** Role ranking. A role satisfies any requirement at or below its own level. */
const RANK: Record<Role, number> = {
  visitor: 0,
  member: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
};

export function atLeast(role: Role, minimum: Role) {
  return RANK[role] >= RANK[minimum];
}

/** Thrown by requireUser / requireRole; routes turn this into 401 or 403. */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The signed-in user plus their portal roles, or null. Never throws — safe for public pages. */
export async function getSession(): Promise<{ user: User; portalRoles: string[] } | null> {
  const store = await cookies();
  const token = store.get(PORTAL_COOKIE)?.value;
  if (!token) return null;

  const account = await getPortalAccount(token);
  // Guests are 24-hour portal demo accounts, not website members (owner decision).
  if (!account || account.isGuest) return null;

  const user = await websiteUserFor(account);
  if (user.banned) return null;

  // A portal admin is always an admin here; derived per request, never stored, so it ends when the portal role does.
  // Portal roles come from the portal on every request (cached 60 s) and are never stored on the website user.
  return {
    user: account.roles.includes("admin") ? { ...user, role: "admin" } : user,
    portalRoles: account.roles,
  };
}

/** The signed-in user, or null. Never throws — safe for public pages. */
export async function getSessionUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

/** The signed-in user, or throws 401. Use in any route that writes data. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in to continue.", 401);
  return user;
}

/** The signed-in user with at least `minimum` role, or throws 401 / 403. */
export async function requireRole(minimum: Role): Promise<User> {
  const user = await requireUser();
  if (!atLeast(user.role, minimum)) {
    throw new AuthError("You do not have permission to do this.", 403);
  }
  return user;
}

/** Can this user moderate other people's content? */
export function canModerate(user: User | null) {
  return !!user && atLeast(user.role, "moderator");
}

/** Can this user create and publish official posts? */
export function canPublishOfficial(user: User | null) {
  return !!user && atLeast(user.role, "editor");
}
