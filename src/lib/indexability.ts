/**
 * Which pages search engines may index — the one place that decides.
 *
 * sitemap.xml, each page's robots tag and IndexNow all ask here, so a URL is
 * never in the sitemap while its page says noindex (crawlers read that
 * contradiction as a quality problem), and a page opens or closes to search on
 * its own as content arrives or leaves. Nobody switches anything by hand.
 *
 * Pure rules only. The database read that feeds them is indexable-posts.ts,
 * kept apart because the repo layer imports this file (through indexnow.ts).
 */

import type { Blog, BlogType } from "@/lib/repo/types";
import { topicPath } from "@/lib/topic-slug";

/**
 * How many indexable posts a page needs before it is worth a search result.
 * A topic needs two: with one, it only repeats the article it links to.
 */
export const MIN_POSTS = { listing: 1, topic: 2, member: 1 } as const;

/** The listing page each kind of post appears on. */
export const LISTING_PATH: Record<BlogType, string> = {
  official: "/blog",
  community: "/community",
  discussion: "/discussions",
};

/**
 * A post a crawler may index: published, public, not noindex.
 * `!noIndex` rather than `=== false`, because posts saved before the field
 * existed lack it, and they are indexable.
 */
export function isIndexable(post: Pick<Blog, "status" | "visibility" | "noIndex">) {
  return post.status === "published" && post.visibility === "public" && !post.noIndex;
}

/** The topic pages a post appears on, one entry per address. */
export function topicPathsOf(post: Pick<Blog, "category" | "tags">) {
  return [...new Set([...(post.category ? [post.category] : []), ...post.tags].map(topicPath))];
}

/**
 * The robots value for a page's metadata: nothing when it may be indexed, so
 * the default applies. When it may not, "follow" stays on so crawlers still
 * reach the articles it links to.
 */
export function robotsFor(indexable: boolean) {
  return indexable ? undefined : { index: false, follow: true };
}
