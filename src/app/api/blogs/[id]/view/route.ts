/**
 * POST /api/blogs/[id]/view   count one view of a post
 *
 * Sent by the article page after it opens (components/blog/view-beacon.tsx),
 * so link prefetches and most crawlers never reach it. Who counts is decided
 * in view-rules.ts. Always answers 204: whether a view was counted is not the
 * reader's business, and a failure here must never break the article.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { blogRepo, viewRepo } from "@/lib/repo";
import { dayKey, isBot, shouldCount, visitorKey } from "@/lib/view-rules";

type Params = { params: Promise<{ id: string }> };

let warnedNoSecret = false;

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return new NextResponse(null, { status: 204 });

    const blog = await blogRepo.findById(id);
    if (!blog || !shouldCount(await getSessionUser(), blog)) return new NextResponse(null, { status: 204 });

    // Vercel puts the client address first in x-forwarded-for.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const key = visitorKey(ip, userAgent, blog._id);
    if (!key) {
      if (!warnedNoSecret) console.warn("VIEW_HASH_SECRET is not set — blog views are not being counted.");
      warnedNoSecret = true;
      return new NextResponse(null, { status: 204 });
    }

    await viewRepo.record(blog._id, key, dayKey());
  } catch (error) {
    console.error("View count failed:", error instanceof Error ? error.message : error);
  }
  return new NextResponse(null, { status: 204 });
}
