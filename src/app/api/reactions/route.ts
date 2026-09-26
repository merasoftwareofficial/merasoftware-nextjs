/**
 * POST /api/reactions   toggle Helpful or Insightful on a post
 *
 * Rewritten in B4 onto the repo layer. It used to import firebase-admin and
 * Mongoose directly and threw on every call.
 *
 * The reaction row is the record; the counter on the blog is a cached total
 * moved by blogRepo.incr(), which floors at zero.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { getSessionUser, requireUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo, reactionRepo } from "@/lib/repo";

const schema = z.object({
  blogId: z.string().min(1),
  reaction: z.enum(["helpful", "insightful"]),
});

const COUNTER = { helpful: "helpfulCount", insightful: "insightfulCount" } as const;

export async function GET(request: Request) {
  try {
    const blogId = new URL(request.url).searchParams.get("blogId");
    if (!blogId) return NextResponse.json({ error: "A blogId is required." }, { status: 400 });

    const user = await getSessionUser();
    if (!user) return NextResponse.json({ helpful: false, insightful: false });

    const mine = await reactionRepo.listByUser(user._id, [blogId]);
    return NextResponse.json({
      helpful: mine.some(row => row.reaction === "helpful"),
      insightful: mine.some(row => row.reaction === "insightful"),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { blogId, reaction } = schema.parse(await request.json());

    const blog = await blogRepo.findById(blogId);
    if (!blog || !isReadable(blog, user)) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const existing = await reactionRepo.find(user._id, blogId, reaction);

    if (existing) {
      await reactionRepo.remove(existing._id);
      await blogRepo.incr(blogId, COUNTER[reaction], -1);
    } else {
      await reactionRepo.create({ userId: user._id, targetId: blogId, reaction });
      await blogRepo.incr(blogId, COUNTER[reaction], 1);
    }

    const after = await blogRepo.findById(blogId);
    return NextResponse.json({
      active: !existing,
      count: after ? after[COUNTER[reaction]] : 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
