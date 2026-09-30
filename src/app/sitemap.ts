import type { MetadataRoute } from "next";
import { services } from "@/lib/site-data";
import { blogRepo, userRepo, type BlogCard } from "@/lib/repo";
import { SITE_URL as SITE } from "@/lib/structured-data";
import { topicPath } from "@/lib/topic-slug";

export const dynamic = "force-dynamic";

/**
 * The sitemap search engines read.
 *
 * Only pages that are genuinely public and indexable belong here. A post must
 * be published, `public` and not `noIndex` — which keeps members-only, private
 * and unlisted posts out, and keeps community posts out until a moderator
 * ticks the index box on approval. Submitting a page that says noindex is a
 * contradiction crawlers treat as a quality signal, so this filter matters.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = (await blogRepo.listCards({ status: "published", visibility: "public", noIndex: false })).filter(
    post => post.visibility === "public",
  );

  // lastmod is only worth sending when it is true: a crawler that sees every
  // page "changed today" on every fetch stops trusting the field, and then a
  // new post no longer stands out. So a list page carries the date of the
  // newest post it shows, and a page with no such date sends none.
  const newest = latest(posts);
  const newestOf = (type: BlogCard["type"]) => latest(posts.filter(post => post.type === type));

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: newest, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/services`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/work`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/blog`, lastModified: newestOf("official"), changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/community`, lastModified: newestOf("community"), changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/discussions`, lastModified: newestOf("discussion"), changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/about`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

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

  // Topic pages are worth indexing only where an indexable post actually uses
  // that category or tag, otherwise the sitemap fills with empty pages.
  // Keyed by path so a category and a tag with the same name list once.
  const topics = new Map<string, BlogCard[]>();
  for (const post of posts) {
    const paths = new Set([...(post.category ? [post.category] : []), ...post.tags].map(topicPath));
    for (const path of paths) topics.set(path, [...(topics.get(path) ?? []), post]);
  }
  const topicPages: MetadataRoute.Sitemap = [...topics].map(([path, topicPosts]) => ({
    url: `${SITE}${path}`,
    lastModified: latest(topicPosts),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  // A member profile is listed once that member has an indexable post; a
  // banned account is dropped, matching what /members/[username] serves.
  // One read for every author, in the order their posts first appear.
  const authorIds = [...new Set(posts.map(post => post.authorId))];
  const authors = new Map((await userRepo.findByIds(authorIds)).map(author => [author._id, author]));
  const memberPages: MetadataRoute.Sitemap = [];
  for (const authorId of authorIds) {
    const author = authors.get(authorId);
    if (!author || author.banned) continue;
    memberPages.push({
      url: `${SITE}/members/${encodeURIComponent(author.username)}`,
      lastModified: latest(posts.filter(post => post.authorId === authorId)),
      changeFrequency: "weekly",
      priority: 0.4,
    });
  }

  return [...staticPages, ...servicePages, ...postPages, ...topicPages, ...memberPages];
}

/** The most recent edit among these posts, or undefined when there are none. */
function latest(posts: BlogCard[]) {
  if (!posts.length) return undefined;
  return new Date(Math.max(...posts.map(post => Date.parse(post.updatedAt))));
}
