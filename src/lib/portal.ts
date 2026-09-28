/**
 * The client portal (E:\merasoftware-new) owns every account and its password.
 * The website trusts the portal's signed `token` cookie and keeps only its own
 * profile record (blog role, posts, comments) linked by the portal user id.
 * Plan and decisions: src/docs/login.md.
 */

import { jwtVerify } from "jose";
import { slugify } from "@/lib/slug";
import { userRepo, type User } from "@/lib/repo";

export const PORTAL_COOKIE = "token";

export interface PortalAccount {
  id: string;
  email: string;
  name: string;
  roles: string[];
  isGuest: boolean;
}

// A ban in the portal reaches the website within this window (owner-approved trade-off).
const STATUS_TTL_MS = 60_000;
const MAX_CACHED = 1000;
const statusCache = new Map<string, { account: PortalAccount | null; expires: number }>();

function requiredEnv(name: "TOKEN_SECRET_KEY" | "PORTAL_API_URL" | "PORTAL_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see src/docs/login.md`);
  return value;
}

/** Public addresses the browser uses: the portal API (sign-in) and the portal app. */
export function portalAddresses() {
  return {
    apiUrl: requiredEnv("PORTAL_API_URL").replace(/\/$/, ""),
    portalUrl: requiredEnv("PORTAL_URL").replace(/\/$/, ""),
  };
}

/** Where sign-in may return to: a path on this site or a page on the portal — never another site. */
export function safeNextTarget(raw: string | undefined, portalUrl: string) {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  try {
    const url = new URL(raw);
    if (url.origin === new URL(portalUrl).origin) return url.toString();
  } catch {
    // Not a URL: fall through to the home page.
  }
  return "/";
}

async function tokenUserId(token: string) {
  const secret = new TextEncoder().encode(requiredEnv("TOKEN_SECRET_KEY"));
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return typeof payload._id === "string" ? payload._id : null;
  } catch {
    return null;
  }
}

/**
 * The token alone is not enough: it carries only the active role (an admin can
 * switch to `customer`) and nothing about guests or bans. `user-details` answers
 * 401 for a banned or deleted account.
 */
async function fetchAccount(token: string): Promise<PortalAccount | null> {
  const base = requiredEnv("PORTAL_API_URL").replace(/\/$/, "");
  const response = await fetch(`${base}/api/user-details`, {
    headers: { cookie: `${PORTAL_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const body = await response.json();
  const data = body?.data;
  if (!body?.success || !data?._id || !data?.email) return null;

  return {
    id: String(data._id),
    email: String(data.email).trim().toLowerCase(),
    name: typeof data.name === "string" ? data.name.trim() : "",
    roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
    isGuest: data.isGuest === true,
  };
}

function remember(token: string, account: PortalAccount | null) {
  const now = Date.now();
  if (statusCache.size >= MAX_CACHED) {
    for (const [key, entry] of statusCache) if (entry.expires <= now) statusCache.delete(key);
    if (statusCache.size >= MAX_CACHED) statusCache.clear();
  }
  statusCache.set(token, { account, expires: now + STATUS_TTL_MS });
}

/** The portal account behind a `token` cookie, or null when it is invalid, banned or deleted. */
export async function getPortalAccount(token: string): Promise<PortalAccount | null> {
  const cached = statusCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.account;

  const userId = await tokenUserId(token);
  if (!userId) return null;

  let account: PortalAccount | null;
  try {
    account = await fetchAccount(token);
  } catch (error) {
    // Portal unreachable: signed out for now, and not cached so it recovers on the next request.
    console.error("Portal status check failed:", error instanceof Error ? error.message : error);
    return null;
  }

  if (account && account.id !== userId) account = null;
  remember(token, account);
  return account;
}

async function freeUsername(email: string) {
  const base = slugify(email.split("@")[0]) || "member";
  if (!(await userRepo.findByUsername(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await userRepo.findByUsername(candidate))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// The header and the page resolve the session in parallel; on a first visit both would create the profile.
const resolving = new Map<string, Promise<User>>();

/** The website profile for a portal account, created on the first signed-in visit. */
export function websiteUserFor(account: PortalAccount): Promise<User> {
  const pending = resolving.get(account.id);
  if (pending) return pending;
  const work = findOrCreateUser(account).finally(() => resolving.delete(account.id));
  resolving.set(account.id, work);
  return work;
}

async function findOrCreateUser(account: PortalAccount): Promise<User> {
  const linked = await userRepo.findByPortalUserId(account.id);
  if (linked) return linked;

  const sameEmail = await userRepo.findByEmail(account.email);
  if (sameEmail) {
    // Portal signup does not verify email, so an existing profile keeps its content but never an elevated role.
    return (await userRepo.update(sameEmail._id, { portalUserId: account.id, role: "member" })) ?? sameEmail;
  }

  try {
    return await userRepo.create({
      email: account.email,
      username: await freeUsername(account.email),
      displayName: account.name || account.email.split("@")[0],
      role: "member",
      banned: false,
      portalUserId: account.id,
    });
  } catch (error) {
    // Another server instance created it first; the unique index turned our insert away.
    const created = await userRepo.findByPortalUserId(account.id);
    if (created) return created;
    throw error;
  }
}
