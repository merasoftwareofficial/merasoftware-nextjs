import { atLeast } from "@/lib/auth";
import { viewsVisible } from "@/lib/view-rules";
import type { Blog, Settings, User } from "@/lib/repo/types";

/** Public responses use an allowlist; adding a DB field never makes it public. */
export function blogResponse(blog: Blog, viewer: User | null, settings: Settings) {
  if (viewer && atLeast(viewer.role, "moderator")) return blog;

  const readable = {
    _id: blog._id,
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    content: blog.content,
    authorName: blog.authorName,
    type: blog.type,
    category: blog.category,
    tags: blog.tags,
    featuredImage: blog.featuredImage ? { url: blog.featuredImage.url, alt: blog.featuredImage.alt } : undefined,
    seo: blog.seo ? { title: blog.seo.title, description: blog.seo.description, canonical: blog.seo.canonical } : undefined,
    publishedAt: blog.publishedAt,
    updatedAt: blog.updatedAt,
    helpfulCount: blog.helpfulCount,
    insightfulCount: blog.insightfulCount,
    ...(viewsVisible(blog, settings) ? { viewCount: blog.viewCount ?? 0 } : {}),
  };

  // Authors still need their draft status and moderation feedback.
  if (viewer?._id === blog.authorId) {
    return { ...readable, status: blog.status, visibility: blog.visibility, reviewNote: blog.reviewNote };
  }
  return readable;
}
