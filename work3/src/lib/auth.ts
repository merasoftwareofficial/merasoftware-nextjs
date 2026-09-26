/**
 * Session and permission layer.
 *
 * DEVELOPMENT AUTH — not production security. A signed-in user is stored in a
 * httpOnly cookie holding a user id; there is no password check yet. This
 * exists so every role-gated flow (member submit, moderator approve, admin
 * publish) can be built and tested before Firebase is configured.
 *
 * Migration: replace readSession() with a Firebase ID-token verification
 * (src/lib/firebase-admin.ts already has verifyIdToken wired). requireUser()
 * and requireRole() keep their signatures, so no caller changes.
 */

import { cookies } from "next/headers";
import { userRepo, type Role, type User } from "@/lib/repo";

export const SESSION_COOKIE = "ms_session";

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

/** The signed-in user, or null. Never throws — safe for public pages. */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  const user = await userRepo.findById(userId);
  if (!user || user.banned) return null;
  return user;
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
