/**
 * POST /api/blogs/[id]/share   count one share click   { platform }
 *
 * Sent by the share buttons (components/blog/share-bar.tsx) when a reader
 * shares. Counted for the admin panel only. Who counts is decided in
 * view-rules.ts (same people as views) and share-rules.ts (only a button the
 * post really shows). Always answers 204, like the view count: a failure here
 * must never get in the way of the share itself.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { blogRepo, settingsRepo, shareRepo } from "@/lib/repo";
import { shareCountable } from "@/lib/share-rules";
import { dayKey, isBot, shouldCount, visitorKey } from "@/lib/view-rules";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  platform: z.enum(["whatsapp", "facebook", "x", "linkedin", "telegram", "email", "copy", "native"]),
});

let warnedNoSecret = false;

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return new NextResponse(null, { status: 204 });

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return new NextResponse(null, { status: 204 });
    const { platform } = body.data;

    const [blog, settings] = await Promise.all([blogRepo.findById(id), settingsRepo.get()]);
    if (!blog || !shareCountable(blog, settings, platform) || !shouldCount(await getSessionUser(), blog)) {
      return new NextResponse(null, { status: 204 });
    }

    // Vercel puts the client address first in x-forwarded-for.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const key = visitorKey(ip, userAgent, blog._id, `share:${platform}`);
    if (!key) {
      if (!warnedNoSecret) console.warn("VIEW_HASH_SECRET is not set — blog shares are not being counted.");
      warnedNoSecret = true;
      return new NextResponse(null, { status: 204 });
    }

    await shareRepo.record(blog._id, platform, key, dayKey());
  } catch (error) {
    console.error("Share count failed:", error instanceof Error ? error.message : error);
  }
  return new NextResponse(null, { status: 204 });
}
