/**
 * GET  /api/saved-posts   the signed-in member's saved posts
 * POST /api/saved-posts   toggle a post in that list
 *
 * Rewritten in B4 onto the repo layer. It used to import firebase-admin and
 * Mongoose directly and threw on every call.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogResponse } from "@/lib/blog-response";
import { blogRepo, savedRepo, settingsRepo } from "@/lib/repo";

const schema = z.object({ blogId: z.string().min(1) });

export async function GET() {
  try {
    const user = await requireUser();
    const [rows, settings] = await Promise.all([savedRepo.listByUser(user._id), settingsRepo.get()]);

    // A post that was deleted or is no longer readable drops out of the list
    // rather than showing as a broken row. One read for all of them, kept in
    // saved order.
    const byId = new Map((await blogRepo.findByIds(rows.map(row => row.blogId))).map(blog => [blog._id, blog]));
    const posts = [];
    for (const row of rows) {
      const blog = byId.get(row.blogId);
      if (blog && isReadable(blog, user)) posts.push(blogResponse(blog, user, settings));
    }

    return NextResponse.json({ posts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { blogId } = schema.parse(await request.json());

    // Independent reads, so they go together; the write order below is unchanged.
    const [blog, existing] = await Promise.all([blogRepo.findById(blogId), savedRepo.find(user._id, blogId)]);
    if (!blog || !isReadable(blog, user)) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    if (existing) {
      await savedRepo.remove(existing._id);
      await blogRepo.incr(blogId, "saveCount", -1);
    } else {
      await savedRepo.create({ userId: user._id, blogId });
      await blogRepo.incr(blogId, "saveCount", 1);
    }

    return NextResponse.json({ saved: !existing });
  } catch (error) {
    return errorResponse(error);
  }
}
