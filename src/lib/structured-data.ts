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

import type { Blog, OrganizationSeo, User } from "@/lib/repo";

/**
 * The site's one public address. Vercel redirects merasoftware.com to www
 * (308), so every canonical, sitemap and structured-data URL uses www — a URL
 * that redirects is never the canonical one. Layout, sitemap and robots read
 * this constant; do not write the domain anywhere else.
 */
export const SITE_URL = "https://www.merasoftware.com";
export const SITE_NAME = "Mera Software";
/** The homepage title and the description every page without its own falls back to. */
export const SITE_TITLE = "Mera Software | Digital Growth Partner";
export const SITE_DESCRIPTION = "Web development, SEO and performance marketing for growing businesses.";

/** The generated share image for a title (app/og/route.tsx). */
export function ogImageUrl(title: string, label?: string) {
  return `${SITE_URL}/og?${new URLSearchParams({ title, ...(label ? { label } : {}) })}`;
}

/**
 * The publisher block every Article repeats. `organization` is what the
 * editors saved at /admin/page-seo; the logo is left out until there is one.
 */
function publisher(organization?: OrganizationSeo) {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: organization?.logoUrl ? { "@type": "ImageObject", url: organization.logoUrl } : undefined,
  };
}

export function organisationLd(organization?: OrganizationSeo) {
  return {
    "@context": "https://schema.org",
    ...publisher(organization),
    email: "contact@merasoftware.com",
    description: SITE_DESCRIPTION,
    sameAs: organization?.sameAs.length ? organization.sameAs : undefined,
  };
}

/**
 * FAQPage data for a post's questions. Google shows FAQ rich results only for
 * a few authoritative sites since 2023, but the markup still tells search and
 * AI engines which answer belongs to which question.
 */
export function faqLd(post: Pick<Blog, "faqs">) {
  if (!post.faqs?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/**
 * Article data for one post.
 *
 * `author` is a Person pointing at the member profile when the author still
 * exists, so the byline, the profile page and this markup all agree.
 */
export function articleLd(post: Blog, author: User | null, organization?: OrganizationSeo) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${post.slug}` },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    // Google wants an image on every article; the generated one stands in.
    image: post.featuredImage?.url || ogImageUrl(post.seo?.title || post.title, post.category),
    keywords: post.tags.length ? post.tags.join(", ") : undefined,
    articleSection: post.category || undefined,
    author: {
      "@type": "Person",
      name: post.authorName,
      url: author ? `${SITE_URL}/members/${author.username}` : undefined,
    },
    publisher: publisher(organization),
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
