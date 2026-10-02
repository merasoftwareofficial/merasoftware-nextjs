/**
 * GET   /api/subscriptions/me?token=   read your notification choices
 * PATCH /api/subscriptions/me          change them ({ token?, categories, offers })
 *
 * The record is found by the manage-link token, else the signed-in user, else
 * this browser's notification cookie (src/lib/subscription-actions.ts ownSubscriber).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { emailState, NOTIFY_COOKIE, preferencesSchema } from "@/lib/notify-rules";
import type { Subscriber } from "@/lib/repo";
import { ownSubscriber, updatePreferences } from "@/lib/subscription-actions";

/** Never the token or ids: only what the preference page shows. */
function view(subscriber: Subscriber) {
  return { email: subscriber.email ?? null, emailStatus: emailState(subscriber), categories: subscriber.categories, offers: subscriber.offers };
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const subscriber = await ownSubscriber(token, token ? null : await getSessionUser(), (await cookies()).get(NOTIFY_COOKIE)?.value);
    if (!subscriber) return NextResponse.json({ error: "No notification settings found." }, { status: 404 });
    return NextResponse.json(view(subscriber));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const input = preferencesSchema.parse(await request.json());
    const subscriber = await ownSubscriber(input.token, input.token ? null : await getSessionUser(), (await cookies()).get(NOTIFY_COOKIE)?.value);
    if (!subscriber) return NextResponse.json({ error: "No notification settings found." }, { status: 404 });
    const updated = await updatePreferences(subscriber, input);
    return NextResponse.json(view(updated!));
  } catch (error) {
    return errorResponse(error);
  }
}
