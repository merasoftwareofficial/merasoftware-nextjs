/**
 * POST /api/staff-push   this admin browser gets activity alerts ({ subscription })
 *
 * Sent by the panel's alert banner (components/staff-alerts.tsx) when an
 * admin allows notifications, and again on every panel visit while allowed,
 * which keeps the device's lastSeenAt fresh (STAFF_DEVICE_TTL_MS). Admins only:
 * the role is checked here, on every call, because it is not stored with the
 * device (src/docs/NOTIFICATIONS.md, "Admin alerts").
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { staffDeviceSchema } from "@/lib/notify-rules";
import { pushConfigured } from "@/lib/push";
import { staffDeviceRepo } from "@/lib/repo";

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    if (!pushConfigured()) return NextResponse.json({ error: "Notifications are not available yet." }, { status: 503 });
    const { subscription } = staffDeviceSchema.parse(await request.json());
    await staffDeviceRepo.upsert({
      userId: user._id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: request.headers.get("user-agent")?.slice(0, 300) || undefined,
    });
    return NextResponse.json({ active: true });
  } catch (error) {
    return errorResponse(error);
  }
}
