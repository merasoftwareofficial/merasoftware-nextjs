/**
 * GET /api/subscribe/confirm?token=   the link in the confirm mail
 *
 * Confirms the address, then opens its preference page.
 */

import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscription-actions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  try {
    const subscriber = token ? await confirmSubscription(token) : null;
    const target = subscriber
      ? `/subscribe/manage?token=${encodeURIComponent(subscriber.token)}&confirmed=1`
      : "/subscribe/manage?invalid=1";
    return NextResponse.redirect(new URL(target, url.origin), 303);
  } catch (error) {
    console.error("[subscribe] confirm failed", error);
    return NextResponse.redirect(new URL("/subscribe/manage?failed=1", url.origin), 303);
  }
}
