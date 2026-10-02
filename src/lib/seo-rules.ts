/**
 * SEO checks for a blog post — the one set of rules the blog form, the review
 * queue and the SEO health page (/admin/seo) all read.
 *
 * Rules:
 * - Each check looks at what search engines actually receive, not at the raw
 *   field: an empty SEO title means the article title is used, an empty meta
 *   description means the excerpt is used (blog/[slug]/page.tsx). So a post
 *   that relies on those fallbacks is only flagged when the fallback itself
 *   falls short — community posts have no SEO fields at all.
 * - Nothing here blocks a save or a publish. The editor is shown the issues
 *   once before publishing and may go ahead anyway (owner decision).
 * - Nothing is stored. Issues are worked out from the post every time, so
 *   fixing a field clears its warning without anything to keep in sync.
 * - Limits follow what Google shows, not an official rule (Google publishes
 *   none): about 60 characters of title, 120 (mobile) to 160 (desktop) of
 *   description. Word count is deliberately not checked — Google says it is
 *   not a ranking factor.
 *
 * No database or auth imports, so the client form can use it too.
 */

import type { Blog, HomeImageSlot, HomepageImage, MediaAsset, OrganizationSeo, PageSeo } from "@/lib/repo/types";
import { SITE_NAME, SITE_URL } from "@/lib/structured-data";

/** The layout's title template (layout.tsx) adds this to every post title. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

export const SEO_LIMITS = {
  titleMin: 30,
  titleMax: 60,
  descriptionMin: 120,
  descriptionMax: 160,
  altMax: 125,
  slugMax: 60,
} as const;

/** ok = nothing to do; warning = worth improving; error = something is missing. */
export type SeoLevel = "ok" | "warning" | "error";

/**
 * The form field a check belongs to. Each is the `id` of that field in the
 * blog form, so `/admin/blog/<slug>/edit#<field>` lands on it.
 */
export type SeoField = "seo-title" | "seo-description" | "blog-slug" | "blog-featured-image" | "blog-image-alt" | "blog-content" | "image-alt" | "org-logo" | "org-same-as";

export interface SeoCheck {
  id: string;
  field: SeoField;
  level: SeoLevel;
  /** Short name for checklists, e.g. "Google title". */
  label: string;
  message: string;
}

/** The parts of a post the checks read; the form builds it from its draft. */
export interface SeoInput {
  title: string;
  seoTitle: string;
  excerpt: string;
  seoDescription: string;
  slug: string;
  imageUrl: string;
  imageAlt: string;
  content: unknown;
}

export function seoInputOf(post: Pick<Blog, "title" | "excerpt" | "slug" | "content" | "featuredImage" | "seo">): SeoInput {
  return {
    title: post.title,
    seoTitle: post.seo?.title ?? "",
    excerpt: post.excerpt,
    seoDescription: post.seo?.description ?? "",
    slug: post.slug,
    imageUrl: post.featuredImage?.url ?? "",
    imageAlt: post.featuredImage?.alt ?? "",
    content: post.content,
  };
}

/** The title Google shows, template included. */
export function googleTitle(input: Pick<SeoInput, "title" | "seoTitle">) {
  return `${input.seoTitle.trim() || input.title.trim()}${TITLE_SUFFIX}`;
}

/** The description Google is given. */
export function googleDescription(input: Pick<SeoInput, "excerpt" | "seoDescription">) {
  return input.seoDescription.trim() || input.excerpt.trim();
}

/** What the article body contains, for the content checks. */
function scanContent(content: unknown) {
  let h2 = 0;
  let internalLinks = 0;
  let images = 0;
  let imagesWithoutAlt = 0;
  const site = new URL(SITE_URL).hostname.replace(/^www\./, "");

  const isInternal = (href: string) => {
    if (href.startsWith("/") && !href.startsWith("//")) return true;
    try {
      return new URL(href).hostname.replace(/^www\./, "") === site;
    } catch {
      return false;
    }
  };

  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as { type?: string; attrs?: Record<string, unknown>; marks?: { type?: string; attrs?: { href?: unknown } }[]; content?: unknown[] };
    if (node.type === "heading" && node.attrs?.level === 2) h2++;
    if (node.type === "image") {
      images++;
      if (!String(node.attrs?.alt ?? "").trim()) imagesWithoutAlt++;
    }
    for (const mark of node.marks ?? []) {
      if (mark.type === "link" && typeof mark.attrs?.href === "string" && isInternal(mark.attrs.href)) internalLinks++;
    }
    (node.content ?? []).forEach(walk);
  };
  walk(content);
  return { h2, internalLinks, images, imagesWithoutAlt };
}

/** The alt text rule every image shares: present, and short enough for screen readers. */
export function altTextCheck(alt: string): Pick<SeoCheck, "level" | "message"> {
  const text = alt.trim();
  if (!text) return { level: "error", message: "Missing — describe what the image shows." };
  if (text.length > SEO_LIMITS.altMax) return { level: "warning", message: `${text.length}/${SEO_LIMITS.altMax} characters — screen readers cut long alt text; shorten it.` };
  return { level: "ok", message: `${text.length}/${SEO_LIMITS.altMax} characters.` };
}

/**
 * A Media Library image. Its alt text is the default every new use starts
 * with, so a missing one turns into missing alt text wherever it is inserted.
 */
export function mediaSeoChecks(asset: Pick<MediaAsset, "altText">): SeoCheck[] {
  const check = altTextCheck(asset.altText);
  // A warning, not an error: each place that already uses the image keeps its own alt text.
  if (check.level === "error") return [{ id: "library-alt", field: "image-alt", label: "Default alt text", level: "warning", message: "Missing — every new use of this image starts without alt text." }];
  return [{ id: "library-alt", field: "image-alt", label: "Default alt text", ...check }];
}

/** One homepage image placement; its own alt text is what the homepage shows. */
export function homepageImageSeoChecks(image: Pick<HomepageImage, "alt">, slot: HomeImageSlot): SeoCheck[] {
  return [{ id: `homepage-${slot}-alt`, field: "image-alt", label: "Alt text", ...altTextCheck(image.alt) }];
}

/** The title rule: `title` is the full title Google shows; `source` says where it came from. */
function titleCheck(title: string, source: string): SeoCheck {
  const base = { id: "title-length", field: "seo-title", label: "Google title" } as const;
  if (title.length > SEO_LIMITS.titleMax) return { ...base, level: "warning", message: `${title.length}/${SEO_LIMITS.titleMax} characters${title.endsWith(TITLE_SUFFIX) ? ` with "${TITLE_SUFFIX.trim()}"` : ""} — Google will cut the end. ${source}.` };
  if (title.length < SEO_LIMITS.titleMin) return { ...base, level: "warning", message: `${title.length}/${SEO_LIMITS.titleMax} characters — short; add the main search phrase. ${source}.` };
  return { ...base, level: "ok", message: `${title.length}/${SEO_LIMITS.titleMax} characters. ${source}.` };
}

/** The description rule, on the text Google is given. */
function descriptionCheck(description: string, source: string): SeoCheck {
  const base = { id: "description-length", field: "seo-description", label: "Google description" } as const;
  if (!description) return { ...base, level: "error", message: "Missing — Google will pick random text from the page." };
  if (description.length > SEO_LIMITS.descriptionMax) return { ...base, level: "warning", message: `${description.length}/${SEO_LIMITS.descriptionMax} characters — Google will cut the end. ${source}.` };
  if (description.length < SEO_LIMITS.descriptionMin) return { ...base, level: "warning", message: `${description.length}/${SEO_LIMITS.descriptionMax} characters — fine on mobile, short on desktop (aim for ${SEO_LIMITS.descriptionMin}–${SEO_LIMITS.descriptionMax}). ${source}.` };
  return { ...base, level: "ok", message: `${description.length}/${SEO_LIMITS.descriptionMax} characters. ${source}.` };
}

/** What a site page (lib/page-seo.ts) sends to search engines, defaults applied. */
export interface PageSeoInput {
  /** The full title Google shows. */
  title: string;
  description: string;
  /** Whether each came from the editor (true) or the page's built-in default. */
  customTitle: boolean;
  customDescription: boolean;
  imageUrl: string;
  imageAlt: string;
}

/** The business details search engines read (Organization data). */
export function organizationSeoChecks(organization?: Partial<OrganizationSeo>): SeoCheck[] {
  const profiles = organization?.sameAs?.length ?? 0;
  return [
    organization?.logoUrl
      ? { id: "org-logo", field: "org-logo", label: "Logo", level: "ok", message: "Set — Google may show it next to your results." }
      : { id: "org-logo", field: "org-logo", label: "Logo", level: "warning", message: "No logo — add a square one (at least 112 × 112 px) so Google can show it." },
    profiles
      ? { id: "org-same-as", field: "org-same-as", label: "Profiles", level: "ok", message: `${profiles} profile link${profiles === 1 ? "" : "s"} tie the business to its other pages.` }
      : { id: "org-same-as", field: "org-same-as", label: "Profiles", level: "warning", message: "None — add the business's LinkedIn, Instagram or other profile links." },
  ];
}

/** A site page as lib/page-seo.ts lists it. */
export interface SeoPage {
  key: string;
  label: string;
  path: string;
  /** Built-in title, without the suffix (the homepage's is used as written). */
  title: string;
  description: string;
}

/** What a site page sends to search engines: the editor's values, or the page's built-in ones. */
export function resolvePageSeo(page: SeoPage, saved?: Partial<PageSeo>): PageSeoInput & { shortTitle: string } {
  const title = saved?.title?.trim() ?? "";
  const description = saved?.description?.trim() ?? "";
  const shortTitle = title || page.title;
  return {
    shortTitle,
    title: page.key === "home" ? shortTitle : `${shortTitle}${TITLE_SUFFIX}`,
    description: description || page.description,
    customTitle: Boolean(title),
    customDescription: Boolean(description),
    imageUrl: saved?.imageUrl?.trim() ?? "",
    imageAlt: saved?.imageAlt?.trim() ?? "",
  };
}

/** Every check for one site page, passing ones included. */
export function pageSeoChecks(input: PageSeoInput): SeoCheck[] {
  const checks = [
    titleCheck(input.title, input.customTitle ? "SEO title" : "Built-in title"),
    descriptionCheck(input.description, input.customDescription ? "Meta description" : "Built-in description"),
  ];
  // No share image is fine: the generated one is used (app/og/route.tsx).
  if (input.imageUrl) checks.push({ id: "share-alt", field: "image-alt", label: "Share image alt text", ...altTextCheck(input.imageAlt) });
  return checks;
}

/** Every check for one post, passing ones included (the form shows them as ticks). */
export function blogSeoChecks(input: SeoInput): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const add = (check: SeoCheck) => checks.push(check);

  add(titleCheck(googleTitle(input), input.seoTitle.trim() ? "SEO title" : "Article title (no SEO title set)"));
  add(descriptionCheck(googleDescription(input), input.seoDescription.trim() ? "Meta description" : "Short description (no meta description set)"));

  // Featured image and its alt text.
  if (!input.imageUrl) {
    add({ id: "featured-image", field: "blog-featured-image", label: "Featured image", level: "warning", message: "No featured image — shares and search results show no picture." });
  } else {
    add({ id: "featured-alt", field: "blog-image-alt", label: "Featured image alt text", ...altTextCheck(input.imageAlt) });
  }

  // URL.
  add({
    id: "slug-length",
    field: "blog-slug",
    label: "URL",
    ...(input.slug.length > SEO_LIMITS.slugMax
      ? { level: "warning", message: `${input.slug.length}/${SEO_LIMITS.slugMax} characters — keep the URL to 3–5 key words.` }
      : { level: "ok", message: `${input.slug.length}/${SEO_LIMITS.slugMax} characters.` }),
  });

  // Article body.
  const body = scanContent(input.content);
  add({
    id: "headings",
    field: "blog-content",
    label: "Headings",
    ...(body.h2 === 0
      ? { level: "warning", message: "No H2 heading — split the article into sections with H2/H3 headings." }
      : { level: "ok", message: `${body.h2} H2 heading${body.h2 === 1 ? "" : "s"}.` }),
  });
  add({
    id: "internal-links",
    field: "blog-content",
    label: "Internal links",
    ...(body.internalLinks === 0
      ? { level: "warning", message: "No link to another page on this site — link a related post or service." }
      : { level: "ok", message: `${body.internalLinks} link${body.internalLinks === 1 ? "" : "s"} to this site.` }),
  });
  if (body.images > 0) {
    add({
      id: "content-image-alt",
      field: "blog-content",
      label: "Images in the article",
      ...(body.imagesWithoutAlt > 0
        ? { level: "warning", message: `${body.imagesWithoutAlt} of ${body.images} image${body.images === 1 ? "" : "s"} in the article ${body.imagesWithoutAlt === 1 ? "has" : "have"} no alt text — click the image, then Image alt in the toolbar.` }
        : { level: "ok", message: `All ${body.images} image${body.images === 1 ? " has" : "s have"} alt text.` }),
    });
  }

  return checks;
}

/** Only the checks that need attention, errors first. */
export function seoIssues(checks: SeoCheck[]) {
  return checks.filter(check => check.level !== "ok").sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}
