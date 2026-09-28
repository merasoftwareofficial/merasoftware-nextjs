/**
 * Session endpoint: GET returns the current user.
 *
 * Signing in, signing up and signing out go to the client portal from the
 * browser (src/app/login/login-form.tsx, src/components/session-menu.tsx).
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
