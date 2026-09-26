/**
 * Shared helpers for API route handlers: consistent error shape and slugs.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

/** Turns any thrown value into a JSON response with a sensible status code. */
export function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      { error: field ? `${field}: ${first.message}` : first?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status: 400 });
}

/** URL-safe slug from a title. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Username from an email address, used when a dev account is created. */
export function usernameFromEmail(email: string) {
  return slugify(email.split("@")[0]) || "member";
}
