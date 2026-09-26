/**
 * POST /api/blogs/[id]/status
 *
 * The single place a post changes state: save-draft, submit, approve, reject,
 * request-changes, publish, schedule, archive, unpublish.
 *
 * Keeping every transition here means the publishing rules from BLOG.md are
 * enforced once — a member can submit but never publish, and community posts
 * stay noindex until a moderator decides otherwise.
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canRunAction, statusActionSchema, statusFor } from "@/lib/blog-rules";
import { blogRepo, type Blog } from "@/lib/repo";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const blog = await blogRepo.findById(id);

    if (!blog) return NextResponse.json({ error: "Post not found." }, { status: 404 });

    const { action, note, scheduledFor, index } = statusActionSchema.parse(await request.json());

    if (!canRunAction(user, blog, action)) {
      return NextResponse.json({ error: "You cannot do that to this post." }, { status: 403 });
    }

    const status = statusFor(action);
    const patch: Partial<Blog> = { status };

    if (action === "publish" || action === "approve") {
      patch.publishedAt = blog.publishedAt ?? new Date().toISOString();
      patch.scheduledFor = undefined;
      // Official posts are indexable on publish. Community posts stay noindex
      // unless the moderator explicitly marks this one as worth indexing.
      patch.noIndex = blog.type === "official" ? false : index !== true;
    }

    if (action === "schedule") {
      if (!scheduledFor) {
        return NextResponse.json({ error: "A schedule date is required." }, { status: 400 });
      }
      if (new Date(scheduledFor) <= new Date()) {
        return NextResponse.json({ error: "The schedule date must be in the future." }, { status: 400 });
      }
      patch.scheduledFor = scheduledFor;
    }

    if (action === "unpublish" || action === "archive") {
      patch.noIndex = true;
    }

    if (action === "reject" || action === "request-changes") {
      patch.reviewNote = note ?? "";
      patch.noIndex = true;
    }

    if (action === "submit") {
      patch.reviewNote = "";
    }

    const updated = await blogRepo.update(id, patch);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
