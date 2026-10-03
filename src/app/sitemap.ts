import type { MetadataRoute } from "next";
import { services } from "@/lib/site-data";
import { FEATURES } from "@/lib/features";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { LISTING_PATH, MIN_POSTS, topicPathsOf } from "@/lib/indexability";
import { indexablePosts } from "@/lib/indexable-posts";
import { userRepo, type BlogCard } from "@/lib/repo";
import { SITE_URL as SITE } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/**
 * The sitemap search engines read.
 *
 * Only pages that are genuinely public and indexable belong here. A post must
 * be published, `public` and not `noIndex` — which keeps members-only, private
 * and unlisted posts out, and keeps community posts out until a moderator
 * ticks the index box on approval. Submitting a page that says noindex is a
 * contradiction crawlers treat as a quality signal, so this filter matters.
 *
 * Every rule comes from indexability.ts, the same one each page's robots tag
 * reads, so a listing, topic or member page joins this file by itself once it
 * has enough posts and leaves it by itself when it no longer does.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Filtered in memory, not with a `noIndex: false` query: posts saved before
  // that field existed lack it, and the query would silently drop them.
  const [posts, portfolio] = await Promise.all([indexablePosts(), portfolioRepo.list(true)]);

  // lastmod is only worth sending when it is true: a crawler that sees every
  // page "changed today" on every fetch stops trusting the field, and then a
  // new post no longer stands out. So a list page carries the date of the
  // newest post it shows, and a page with no such date sends none.
  const newest = latest(posts);
  const newestOf = (type: BlogCard["type"]) => latest(posts.filter(post => post.type === type));

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: newest, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/services`, changeFrequency: "monthly", priority: 0.9 },
    ...(FEATURES.portfolio && portfolio.length ? [{ url: `${SITE}/work`, changeFrequency: "monthly" as const, priority: 0.8 }] : []),
    { url: `${SITE}/about`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // A listing page is listed only while it has something to list.
  const listingPages: MetadataRoute.Sitemap = (
    [
      ["official", 0.8],
      ["community", 0.7],
      ["discussion", 0.7],
    ] as const
  )
    .filter(([type]) => posts.filter(post => post.type === type).length >= MIN_POSTS.listing)
    .map(([type, priority]) => ({
      url: `${SITE}${LISTING_PATH[type]}`,
      lastModified: newestOf(type),
      changeFrequency: "daily",
      priority,
    }));

  const servicePages: MetadataRoute.Sitemap = services.map(service => ({
    url: `${SITE}/services/${service.slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const postPages: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: "monthly",
    priority: post.type === "official" ? 0.9 : 0.6,
  }));

  // A topic page is listed once enough indexable posts use that category or
  // tag; below that it only repeats the article it links to.
  // Keyed by path so a category and a tag with the same name count once.
  const topics = new Map<string, BlogCard[]>();
  for (const post of posts) {
    for (const path of topicPathsOf(post)) topics.set(path, [...(topics.get(path) ?? []), post]);
  }
  const topicPages: MetadataRoute.Sitemap = [...topics]
    .filter(([, topicPosts]) => topicPosts.length >= MIN_POSTS.topic)
    .map(([path, topicPosts]) => ({
      url: `${SITE}${path}`,
      lastModified: latest(topicPosts),
      changeFrequency: "weekly",
      priority: 0.5,
    }));

  // A member profile is listed once that member has enough indexable posts
  // (MIN_POSTS.member); a banned account is dropped, matching what
  // /members/[username] serves.
  // One read for every author, in the order their posts first appear.
  const authorIds = [...new Set(posts.map(post => post.authorId))];
  const authors = new Map((await userRepo.findByIds(authorIds)).map(author => [author._id, author]));
  const memberPages: MetadataRoute.Sitemap = [];
  for (const authorId of authorIds) {
    const author = authors.get(authorId);
    if (!author || author.banned) continue;
    const authorPosts = posts.filter(post => post.authorId === authorId);
    if (authorPosts.length < MIN_POSTS.member) continue;
    memberPages.push({
      url: `${SITE}/members/${encodeURIComponent(author.username)}`,
      lastModified: latest(authorPosts),
      changeFrequency: "weekly",
      priority: 0.4,
    });
  }

  const portfolioPages: MetadataRoute.Sitemap = portfolio.map(entry => ({ url: `${SITE}/work/${entry.slug}`, lastModified: new Date(entry.updatedAt), changeFrequency: "monthly", priority: 0.8 }));
  return [...staticPages, ...listingPages, ...servicePages, ...postPages, ...topicPages, ...memberPages, ...portfolioPages];
}

/** The most recent edit among these posts, or undefined when there are none. */
function latest(posts: BlogCard[]) {
  if (!posts.length) return undefined;
  return new Date(Math.max(...posts.map(post => Date.parse(post.updatedAt))));
}
