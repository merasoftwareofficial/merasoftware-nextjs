/**
 * GET  /api/comments?blogId=…   the comments a viewer may see on one post
 * POST /api/comments            write a comment or a reply
 *
 * Whether a new comment is visible at once or held for review is not decided
 * here: initialCommentStatus() reads the post's own mode and the site setting,
 * so the admin panel controls it — see comment-rules.ts.
 *
 * GET also returns `liked`: the ids among them this viewer (account or
 * browser cookie) likes. A new comment alerts the admins (notify-queue.ts).
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSessionUser, requireUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import {
  commentInputSchema,
  commentsAccepted,
  initialCommentStatus,
  isCommentReadable,
  visibleStatuses,
  VOTER_COOKIE,
  voterKey,
} from "@/lib/comment-rules";
import { queueStaffAlert } from "@/lib/notify-queue";
import { blogRepo, commentLikeRepo, commentRepo, settingsRepo } from "@/lib/repo";

export async function GET(request: Request) {
  try {
    const blogId = new URL(request.url).searchParams.get("blogId");
    if (!blogId) return NextResponse.json({ error: "A blogId is required." }, { status: 400 });

    const viewer = await getSessionUser();
    const blog = await blogRepo.findById(blogId);
    if (!blog || !isReadable(blog, viewer)) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const comments = await commentRepo.listByBlog(blogId, visibleStatuses(viewer, blog));
    const voter = voterKey(viewer, (await cookies()).get(VOTER_COOKIE)?.value);
    const liked = voter ? await commentLikeRepo.likedBy(voter, comments.map(comment => comment._id)) : [];
    return NextResponse.json({ comments, liked });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { blogId, parentId, body } = commentInputSchema.parse(await request.json());

    const blog = await blogRepo.findById(blogId);
    // A post the viewer cannot read must not reveal itself through comments.
    if (!blog || !isReadable(blog, user)) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const settings = await settingsRepo.get();
    if (!commentsAccepted(blog, settings)) {
      return NextResponse.json({ error: "Comments are closed on this post." }, { status: 403 });
    }

    if (parentId) {
      const parent = await commentRepo.findById(parentId);
      if (!parent || parent.blogId !== blogId || !isCommentReadable(parent, user, blog)) {
        return NextResponse.json({ error: "The comment you replied to is gone." }, { status: 404 });
      }
      // One level of replies keeps the thread readable; a reply to a reply
      // attaches to the same parent rather than nesting further.
      if (parent.parentId) {
        return NextResponse.json({ error: "Reply to the top comment of the thread." }, { status: 400 });
      }
    }

    const comment = await commentRepo.create({
      blogId,
      parentId,
      userId: user._id,
      userName: user.displayName,
      body,
      status: initialCommentStatus(blog, settings),
    });
    await queueStaffAlert("comment", comment._id);

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
