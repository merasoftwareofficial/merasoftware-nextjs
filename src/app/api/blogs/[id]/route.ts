/**
 * GET    /api/blogs/[id]   read one post
 * PATCH  /api/blogs/[id]   edit the post body and metadata
 * DELETE /api/blogs/[id]   remove the post
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { blogResponse } from "@/lib/blog-response";
import { articleContentSchema } from "@/lib/content-rules";
import { slugify } from "@/lib/slug";
import { getSessionUser, requireUser } from "@/lib/auth";
import { blogInputSchema, canDelete, canEdit, isReadable } from "@/lib/blog-rules";
import { categoryError } from "@/lib/category-rules";
import { canSetCommentMode } from "@/lib/comment-rules";
import { canSetViewMode } from "@/lib/view-rules";
import { canSetShareMode } from "@/lib/share-rules";
import { blogRepo, categoryRepo, settingsRepo } from "@/lib/repo";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const viewer = await getSessionUser();
    const blog = await blogRepo.findById(id);

    if (!blog || !isReadable(blog, viewer)) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    return NextResponse.json(blogResponse(blog, viewer, await settingsRepo.get()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const blog = await blogRepo.findById(id);

    if (!blog) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (!canEdit(user, blog)) {
      return NextResponse.json({ error: "You cannot edit this post." }, { status: 403 });
    }

    const data = blogInputSchema.partial().parse(await request.json());

    const categoryProblem = categoryError(await categoryRepo.list(), blog.type, data.category, blog.category);
    if (categoryProblem) return NextResponse.json({ error: categoryProblem }, { status: 400 });

    if (data.slug) {
      const slug = slugify(data.slug);
      const clash = await blogRepo.findBySlug(slug);
      if (clash && clash._id !== id) {
        return NextResponse.json({ error: "That URL slug is already used by another post." }, { status: 409 });
      }
      data.slug = slug;
    }

    // Type and author are not editable through this route, and only an editor
    // may change how a post handles comments, its view count or share buttons.
    const { type: _type, comments, showViews, sharing, ...rest } = data;
    const patch = {
      ...rest,
      ...(canSetCommentMode(user) && comments ? { comments } : {}),
      ...(canSetViewMode(user) && showViews ? { showViews } : {}),
      ...(canSetShareMode(user) && sharing ? { sharing } : {}),
    };
    if (blog.status === "published" || blog.status === "scheduled") {
      articleContentSchema.parse(patch.content ?? blog.content);
    }
    const updated = await blogRepo.update(id, patch);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const blog = await blogRepo.findById(id);

    if (!blog) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (!canDelete(user, blog)) {
      return NextResponse.json({ error: "You cannot delete this post." }, { status: 403 });
    }

    await blogRepo.remove(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
