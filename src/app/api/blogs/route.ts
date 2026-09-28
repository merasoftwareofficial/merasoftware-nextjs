/**
 * GET  /api/blogs   list posts (filtered by what the viewer may see)
 * POST /api/blogs   create a post
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { atLeast, getSessionUser, requireUser } from "@/lib/auth";
import { blogInputSchema, initialState, isReadable } from "@/lib/blog-rules";
import { canSetCommentMode } from "@/lib/comment-rules";
import { blogRepo, type BlogQuery, type BlogStatus, type BlogType } from "@/lib/repo";

export async function GET(request: Request) {
  try {
    const viewer = await getSessionUser();
    const params = new URL(request.url).searchParams;

    const query: BlogQuery = {};
    const type = params.get("type");
    const status = params.get("status");
    const category = params.get("category");
    const tag = params.get("tag");
    const search = params.get("search");
    const author = params.get("author");
    const limit = params.get("limit");

    if (type) query.type = type.split(",") as BlogType[];
    if (category) query.category = category;
    if (tag) query.tag = tag;
    if (search) query.search = search;
    if (author) query.authorId = author;
    if (limit) query.limit = Number(limit);

    // Only staff may ask for unpublished posts; everyone else sees published.
    if (status && atLeast(viewer?.role ?? "visitor", "moderator")) {
      query.status = status.split(",") as BlogStatus[];
    } else if (!atLeast(viewer?.role ?? "visitor", "moderator")) {
      query.status = "published";
    }

    const rows = await blogRepo.list(query);
    return NextResponse.json(rows.filter(row => isReadable(row, viewer)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = blogInputSchema.parse(await request.json());

    // Members may only write community content, never official articles.
    const type = atLeast(user.role, "editor") ? data.type : data.type === "discussion" ? "discussion" : "community";

    const slug = slugify(data.slug || data.title);
    if (await blogRepo.findBySlug(slug)) {
      return NextResponse.json({ error: "That URL slug is already used by another post." }, { status: 409 });
    }

    const blog = await blogRepo.create({
      ...data,
      slug,
      type,
      // A member's post follows the site default; only an editor chooses.
      comments: canSetCommentMode(user) ? data.comments ?? "default" : "default",
      authorId: user._id,
      authorName: user.displayName,
      ...initialState(type, user),
    });

    return NextResponse.json(blog, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
