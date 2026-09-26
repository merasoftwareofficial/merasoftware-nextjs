import type { MetadataRoute } from "next";
import { services } from "@/lib/site-data";
import { blogRepo, userRepo } from "@/lib/repo";

const SITE = "https://merasoftware.com";

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
  const posts = (await blogRepo.list({ status: "published", visibility: "public", noIndex: false })).filter(
    post => post.visibility === "public",
  );

  const staticPages: MetadataRoute.Sitemap = ([
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/services`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/work`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/community`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/discussions`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/about`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/contact`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ] satisfies Omit<MetadataRoute.Sitemap[number], "lastModified">[]).map(entry => ({
    ...entry,
    lastModified: new Date(),
  }));

  const servicePages: MetadataRoute.Sitemap = services.map(service => ({
    url: `${SITE}/services/${service.slug}`,
    lastModified: new Date(),
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
  const topics = new Set<string>();
  for (const post of posts) {
    if (post.category) topics.add(topicSlug(post.category));
    post.tags.forEach(tag => topics.add(topicSlug(tag)));
  }
  const topicPages: MetadataRoute.Sitemap = [...topics].map(slug => ({
    url: `${SITE}/topics/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  // A member profile is listed once that member has an indexable post; a
  // banned account is dropped, matching what /members/[username] serves.
  const authorIds = new Set(posts.map(post => post.authorId));
  const memberPages: MetadataRoute.Sitemap = [];
  for (const authorId of authorIds) {
    const author = await userRepo.findById(authorId);
    if (!author || author.banned) continue;
    memberPages.push({
      url: `${SITE}/members/${author.username}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.4,
    });
  }

  return [...staticPages, ...servicePages, ...postPages, ...topicPages, ...memberPages];
}

/** Must match the slug the article page links to and /topics/[slug] resolves. */
function topicSlug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}
