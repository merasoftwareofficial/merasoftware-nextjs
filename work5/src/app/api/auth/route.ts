/**
 * Development sign-in.
 *
 * POST { email, displayName?, role? } signs a user in, creating the account on
 * first use. There is no password: this is a local development session so the
 * role-gated blog flows can be exercised before Firebase is configured.
 * DELETE signs out. GET returns the current user.
 *
 * Migration: the browser will send a Firebase ID token here instead, this route
 * will verify it with firebase-admin, and the user record will be looked up or
 * created from the verified token claims.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, usernameFromEmail } from "@/lib/api";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { userRepo, type Role } from "@/lib/repo";

const ROLES: Role[] = ["member", "moderator", "editor", "admin"];

const loginSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2).max(60).optional(),
  role: z.enum(["member", "moderator", "editor", "admin"]).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  try {
    const { email, displayName, role } = loginSchema.parse(await request.json());

    let user = await userRepo.findByEmail(email);

    if (!user) {
      // First sign-in creates the account. The very first account is the admin
      // so the panel is reachable on a fresh install.
      const existing = await userRepo.list();
      const defaultRole: Role = existing.length === 0 ? "admin" : "member";

      let username = usernameFromEmail(email);
      if (await userRepo.findByUsername(username)) {
        username = `${username}-${existing.length + 1}`;
      }

      user = await userRepo.create({
        email,
        username,
        displayName: displayName?.trim() || email.split("@")[0],
        role: role && ROLES.includes(role) ? role : defaultRole,
        banned: false,
      });
    } else {
      if (user.banned) {
        return NextResponse.json({ error: "This account is banned." }, { status: 403 });
      }
      // Development convenience: the login form can switch an existing test
      // account to another role so every flow can be checked from one browser.
      const patch: Partial<typeof user> = {};
      if (role && ROLES.includes(role) && role !== user.role) patch.role = role;
      if (displayName?.trim() && displayName.trim() !== user.displayName) {
        patch.displayName = displayName.trim();
      }
      if (Object.keys(patch).length) user = (await userRepo.update(user._id, patch)) ?? user;
    }

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, user._id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ user: null });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
