/**
 * PATCH  /api/comments/[id]   approve / hide / show — moderator and above
 * DELETE /api/comments/[id]   remove for good — the author, or an admin
 *
 * Hide and delete are deliberately different powers: a moderator hides a
 * comment and it can come back, an admin deletes it and its replies go too.
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canDeleteComment, canModerateComment, commentPatchSchema } from "@/lib/comment-rules";
import { commentLikeRepo, commentRepo, type CommentStatus } from "@/lib/repo";

type Params = { params: Promise<{ id: string }> };

const NEXT_STATUS: Record<"approve" | "hide" | "show", CommentStatus> = {
  approve: "visible",
  show: "visible",
  hide: "hidden",
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const comment = await commentRepo.findById(id);
    if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

    if (!canModerateComment(user)) {
      return NextResponse.json({ error: "You cannot moderate comments." }, { status: 403 });
    }

    const { action } = commentPatchSchema.parse(await request.json());
    const updated = await commentRepo.update(id, { status: NEXT_STATUS[action] });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();

    const comment = await commentRepo.findById(id);
    if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });

    if (!canDeleteComment(user, comment)) {
      return NextResponse.json({ error: "You cannot delete this comment." }, { status: 403 });
    }

    // The repo removes this comment's replies with it; their likes go too.
    const replies = comment.parentId ? [] : (await commentRepo.listByBlog(comment.blogId)).filter(row => row.parentId === id);
    await commentRepo.remove(id);
    await commentLikeRepo.removeByComments([id, ...replies.map(reply => reply._id)]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
