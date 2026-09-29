/**
 * JSON-LD builders for the structured data search engines read.
 *
 * Kept out of the pages so every page describes itself the same way, and so
 * the site URL and organisation name are written once.
 *
 * Rule: never describe a page here that the page itself will not show. A
 * noindex or members-only post must not emit Article data — that is a
 * mismatch between markup and content, which is exactly what a crawler
 * penalises. The caller decides; jsonLd() below is only the renderer.
 */

import type { Blog, User } from "@/lib/repo";

/**
 * The site's one public address. Vercel redirects merasoftware.com to www
 * (308), so every canonical, sitemap and structured-data URL uses www — a URL
 * that redirects is never the canonical one. Layout, sitemap and robots read
 * this constant; do not write the domain anywhere else.
 */
export const SITE_URL = "https://www.merasoftware.com";
export const SITE_NAME = "Mera Software";

/** The publisher block every Article repeats. */
const publisher = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
};

export function organisationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    email: "contact@merasoftware.com",
    description: "Web development, SEO and performance marketing for growing businesses.",
  };
}

/**
 * Article data for one post.
 *
 * `author` is a Person pointing at the member profile when the author still
 * exists, so the byline, the profile page and this markup all agree.
 */
export function articleLd(post: Blog, author: User | null) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    image: post.featuredImage?.url || undefined,
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    articleSection: post.category || undefined,
    author: {
      "@type": "Person",
      name: post.authorName,
      url: author ? `${SITE_URL}/members/${author.username}` : undefined,
    },
    publisher,
  };
}

/** The author's own profile page. */
export function personLd(author: User, postCount: number) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: author.displayName,
      url: `${SITE_URL}/members/${author.username}`,
      description: author.bio || undefined,
      interactionStatistic: {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/WriteAction",
        userInteractionCount: postCount,
      },
    },
  };
}

/** Breadcrumbs as [label, path] pairs, root first. */
export function breadcrumbLd(trail: [label: string, path: string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${SITE_URL}${path}`,
    })),
  };
}

/**
 * The dangerouslySetInnerHTML value for one JSON-LD block.
 *
 * JSON.stringify drops undefined keys, so an absent image or bio simply does
 * not appear rather than emitting null, which validators flag. The "<" escape
 * stops a title containing markup from closing the script tag early.
 */
export function jsonLd(data: object) {
  return { __html: JSON.stringify(data).replace(/</g, "\u003c") };
}
