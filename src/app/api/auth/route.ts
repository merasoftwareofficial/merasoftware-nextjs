/**
 * Session endpoint: GET returns the current user.
 *
 * Signing in, signing up and signing out go to the client portal from the
 * browser (src/app/login/login-form.tsx, src/components/session-menu.tsx).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { portalAddresses, portalEntryFor } from "@/lib/portal";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null, portal: null }, { headers: { "Cache-Control": "private, no-store" } });
  const { portalUrl } = portalAddresses();
  const user = session.user;
  const badge = user.role !== "admin" && session.portalRoles.includes("customer") ? "customer" : user.role;
  return NextResponse.json({
    user: badge ? { displayName: user.displayName, username: user.username, role: user.role, badge } : null,
    portal: portalEntryFor(session.portalActiveRole, portalUrl),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
