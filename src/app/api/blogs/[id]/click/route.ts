/**
 * POST /api/blogs/[id]/click   count one click on an article   { placement, target }
 *
 * Sent by a related post below the article (components/blog/tracked-link.tsx,
 * target = that post's id) and by the "Next page" button of a long article
 * (components/blog/article-reader.tsx, target = the page number opened).
 * Counted on the article, for the admin panel only. Who counts is decided in
 * view-rules.ts (same people as views) and click-rules.ts (only a click the
 * page could offer). Always answers 204, like the view count: a failure here
 * must never get in the way of the click itself.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { pageCountable, relatedCountable } from "@/lib/click-rules";
import { blogRepo, clickRepo } from "@/lib/repo";
import { dayKey, isBot, shouldCount, visitorKey } from "@/lib/view-rules";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  placement: z.enum(["related", "next-page"]),
  target: z.string().min(1).max(64),
});

let warnedNoSecret = false;

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return new NextResponse(null, { status: 204 });

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return new NextResponse(null, { status: 204 });
    const { placement, target } = body.data;

    const blog = await blogRepo.findById(id);
    if (!blog || !shouldCount(await getSessionUser(), blog)) return new NextResponse(null, { status: 204 });
    if (placement === "related") {
      const next = await blogRepo.findById(target);
      if (!next || !relatedCountable(blog, next)) return new NextResponse(null, { status: 204 });
    } else if (!pageCountable(Number(target))) {
      return new NextResponse(null, { status: 204 });
    }

    // Vercel puts the client address first in x-forwarded-for.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const key = visitorKey(ip, userAgent, blog._id, `click:${placement}:${target}`);
    if (!key) {
      if (!warnedNoSecret) console.warn("VIEW_HASH_SECRET is not set — blog clicks are not being counted.");
      warnedNoSecret = true;
      return new NextResponse(null, { status: 204 });
    }

    await clickRepo.record(blog._id, placement, key, dayKey());
  } catch (error) {
    console.error("Click count failed:", error instanceof Error ? error.message : error);
  }
  return new NextResponse(null, { status: 204 });
}
