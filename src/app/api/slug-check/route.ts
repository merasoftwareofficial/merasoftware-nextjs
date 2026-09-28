/**
 * GET /api/slug-check?slug=my-post&id=<current post id>
 *
 * Tells the editor whether a URL slug is still free, so a clash is caught
 * while typing instead of on save. `id` excludes the post being edited.
 */

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { slugify } from "@/lib/slug";
import { requireUser } from "@/lib/auth";
import { blogRepo } from "@/lib/repo";

export async function GET(request: Request) {
  try {
    await requireUser();
    const params = new URL(request.url).searchParams;
    const slug = slugify(params.get("slug") ?? "");
    const id = params.get("id");

    if (!slug) return NextResponse.json({ slug: "", available: false });

    const existing = await blogRepo.findBySlug(slug);
    return NextResponse.json({ slug, available: !existing || existing._id === id });
  } catch (error) {
    return errorResponse(error);
  }
}
