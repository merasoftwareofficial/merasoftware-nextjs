/**
 * GET  /api/reports    the moderation queue of reports (moderator and above)
 * POST /api/reports    any signed-in member reports a post or a comment
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/auth";
import { reportInputSchema } from "@/lib/comment-rules";
import { blogRepo, commentRepo, reportRepo } from "@/lib/repo";

export async function GET(request: Request) {
  try {
    await requireRole("moderator");
    const resolvedParam = new URL(request.url).searchParams.get("resolved");
    const resolved = resolvedParam === null ? undefined : resolvedParam === "true";
    return NextResponse.json({ reports: await reportRepo.list(resolved) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { targetType, targetId, reason } = reportInputSchema.parse(await request.json());

    // Reporting something that does not exist would only fill the queue.
    const target =
      targetType === "blog" ? await blogRepo.findById(targetId) : await commentRepo.findById(targetId);
    if (!target) return NextResponse.json({ error: "That content is gone." }, { status: 404 });

    const report = await reportRepo.create({
      targetType,
      targetId,
      userId: user._id,
      reason,
      resolved: false,
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
