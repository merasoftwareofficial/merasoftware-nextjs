/**
 * What a post becomes when it goes live — by Publish, by Approve, or by its
 * schedule coming due. One rule, so a scheduled post lands exactly as if an
 * editor had pressed Publish at that moment.
 *
 * Kept apart from blog-rules.ts because the repo layer applies it (repo/index.ts)
 * and blog-rules imports @/lib/auth, which imports the repo — a cycle.
 */

import type { Blog } from "@/lib/repo/types";
import { articleContentSchema } from "@/lib/content-rules";

/** `index` is the moderator's choice on approve; `at` is the go-live time. */
export function publishedState(blog: Blog, index?: boolean, at = new Date().toISOString()): Partial<Blog> {
  articleContentSchema.parse(blog.content);
  return {
    status: "published",
    // A post that was live before keeps its first publish date.
    publishedAt: blog.publishedAt ?? at,
    scheduledFor: undefined,
    // Official posts are indexable on publish. Community posts stay noindex
    // unless the moderator explicitly marks this one as worth indexing.
    noIndex: blog.type === "official" ? false : index !== true,
  };
}
