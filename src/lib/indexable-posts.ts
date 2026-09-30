/**
 * The posts search engines may index, read once per request.
 *
 * Pages use this for their robots tag, not for what they show: a visitor's own
 * view (members-only posts, a moderator's extras) must never decide whether a
 * page is indexed. cache() makes the metadata, the page and the sitemap share
 * one read.
 */

import { cache } from "react";
import { MIN_POSTS, isIndexable } from "@/lib/indexability";
import { blogRepo, type BlogCard, type BlogType } from "@/lib/repo";
import { topicMatches } from "@/lib/topic-slug";

export const indexablePosts = cache(async (): Promise<BlogCard[]> =>
  (await blogRepo.listCards({ status: "published" })).filter(isIndexable),
);

/** Is this listing page (/blog, /community, /discussions) worth indexing? */
export async function listingIndexable(type: BlogType) {
  const posts = await indexablePosts();
  return posts.filter(post => post.type === type).length >= MIN_POSTS.listing;
}

/** Is this /topics/[slug] page worth indexing? `slug` is the route param. */
export async function topicIndexable(slug: string) {
  const posts = await indexablePosts();
  // The same match the topic page uses to list its posts, so the count is of what it shows.
  const onTopic = (post: BlogCard) => [...(post.category ? [post.category] : []), ...post.tags].some(value => topicMatches(value, slug));
  return posts.filter(onTopic).length >= MIN_POSTS.topic;
}

/** Is this member's profile worth indexing? */
export async function memberIndexable(authorId: string) {
  const posts = await indexablePosts();
  return posts.filter(post => post.authorId === authorId).length >= MIN_POSTS.member;
}
