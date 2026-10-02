/**
 * POST   /api/push-devices   allow notifications on this browser ({ subscription, categories, offers })
 * DELETE /api/push-devices   turn them off on this browser ({ endpoint })
 *
 * No login needed: without one, this browser's settings are found by the
 * NOTIFY_COOKIE token, which this route sets (src/docs/NOTIFICATIONS.md).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { NOTIFY_COOKIE, pushDeviceSchema } from "@/lib/notify-rules";
import { pushConfigured } from "@/lib/push";
import { registerPush, unregisterPush } from "@/lib/subscription-actions";

export async function POST(request: Request) {
  try {
    if (!pushConfigured()) return NextResponse.json({ error: "Notifications are not available yet." }, { status: 503 });
    const input = pushDeviceSchema.parse(await request.json());
    const user = await getSessionUser();
    const store = await cookies();
    const subscriber = await registerPush(input, user, store.get(NOTIFY_COOKIE)?.value ?? null, request.headers.get("user-agent"));

    const response = NextResponse.json({ categories: subscriber.categories, offers: subscriber.offers });
    // Signed in, the account finds the record; signed out, only this cookie does.
    if (!user || !subscriber.userId) {
      response.cookies.set(NOTIFY_COOKIE, subscriber.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 400 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

const removeSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export async function DELETE(request: Request) {
  try {
    const { endpoint } = removeSchema.parse(await request.json());
    await unregisterPush(endpoint);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
