/**
 * POST /api/comments/[id]/like   like a comment, or take the like back
 *
 * No login needed (owner decision, 3 Oct 2026). A signed-in person is one
 * voter on every device; a signed-out browser is one voter by its VOTER_COOKIE,
 * set here on its first like. Adding likes is limited per IP (LIKE_LIMIT);
 * taking one back never is. Who may like what is in comment-rules.ts.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { canLikeComment, LIKE_LIMIT, newVoterToken, VOTER_COOKIE, voterKey } from "@/lib/comment-rules";
import { blogRepo, commentLikeRepo, commentRepo, rateRepo } from "@/lib/repo";
import { isBot, visitorKey } from "@/lib/view-rules";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userAgent = request.headers.get("user-agent") ?? "";
    if (isBot(userAgent)) return NextResponse.json({ error: "Likes come from people." }, { status: 403 });

    const [viewer, comment] = await Promise.all([getSessionUser(), commentRepo.findById(id)]);
    const blog = comment ? await blogRepo.findById(comment.blogId) : null;
    if (!comment || !blog || !isReadable(blog, viewer) || !canLikeComment(comment, blog)) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const store = await cookies();
    const saved = store.get(VOTER_COOKIE)?.value;
    const token = viewer ? saved : saved ?? newVoterToken();
    const voter = voterKey(viewer, token)!;

    let liked: boolean;
    let count: number | null;
    if (await commentLikeRepo.remove(comment._id, voter)) {
      liked = false;
      count = await commentRepo.incrLikes(comment._id, -1);
    } else {
      // Keyed by IP alone, so switching browsers or clearing cookies does not reset it.
      // Without VIEW_HASH_SECRET there is no key and no limit, like views.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
      const limitKey = visitorKey(ip, "", "comment-likes");
      if (limitKey && !(await rateRepo.hit(`like:${limitKey}`, LIKE_LIMIT.hits, LIKE_LIMIT.windowMs))) {
        return NextResponse.json({ error: "Too many likes from this network. Try again later." }, { status: 429 });
      }
      liked = true;
      // A second tab that liked a moment ago: already counted, so the count is only read.
      count = (await commentLikeRepo.add({ commentId: comment._id, blogId: blog._id, voterKey: voter }))
        ? await commentRepo.incrLikes(comment._id, 1)
        : comment.likeCount ?? 0;
    }

    const response = NextResponse.json({ liked, count: count ?? 0 });
    if (!viewer && !saved) {
      response.cookies.set(VOTER_COOKIE, token!, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 400 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
