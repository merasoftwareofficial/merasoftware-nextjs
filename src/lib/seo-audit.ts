/**
 * The SEO audit behind /admin/seo and the overview's "SEO issues" count.
 *
 * What it covers:
 * - Blog posts search engines can see — published and indexable
 *   (indexability.ts, the same rule as sitemap.xml) — plus scheduled posts
 *   that will be, since they go live without anyone opening them again.
 *   Drafts and pending posts are checked where they are written and reviewed.
 * - The site's fixed pages (lib/page-seo.ts): their title and description,
 *   built-in or the editor's, and the share image's alt text.
 * - Homepage images that are on the live homepage (the "Selected work" ones
 *   only while FEATURES.portfolio is on).
 * - Every Media Library image: its alt text is the default for each new use.
 *
 * Every issue carries the admin address that fixes it.
 */

import { cache } from "react";
import { FEATURES } from "@/lib/features";
import { isIndexable } from "@/lib/indexability";
import { blogRepo, mediaRepo, settingsRepo } from "@/lib/repo";
import type { HomeImageSlot, HomepageImage } from "@/lib/repo/types";
import { PAGE_SEO_PAGES } from "@/lib/page-seo";
import { blogSeoChecks, homepageImageSeoChecks, mediaSeoChecks, organizationSeoChecks, pageSeoChecks, resolvePageSeo, seoInputOf, seoIssues, type SeoCheck } from "@/lib/seo-rules";

export const SEO_AUDIT_GROUPS = ["Blog posts", "Site pages", "Homepage", "Media library"] as const;
export type SeoAuditGroup = (typeof SEO_AUDIT_GROUPS)[number];

export interface SeoAuditIssue extends SeoCheck {
  /** The admin page (and field) that fixes it. */
  href: string;
}

export interface SeoAuditRow {
  key: string;
  group: SeoAuditGroup;
  title: string;
  meta: string;
  /** The live page, when there is one to open. */
  viewHref?: string;
  issues: SeoAuditIssue[];
}

const HOMEPAGE_SLOT_LABEL: Record<HomeImageSlot, string> = {
  hero: "Hero artwork",
  "work-northstar": "Selected work: Northstar Advisory",
  "work-oasis": "Selected work: Oasis Living",
};

/** Every audited item that has issues, worst first within its group. */
export const seoAudit = cache(async (): Promise<SeoAuditRow[]> => {
  const [posts, settings, assets] = await Promise.all([blogRepo.list({ status: ["published", "scheduled"] }), settingsRepo.get(), mediaRepo.list()]);
  const rows: SeoAuditRow[] = [];

  // A scheduled post becomes indexable on its date when it is public and not noindex.
  for (const post of posts.filter(post => isIndexable(post) || (post.status === "scheduled" && post.visibility === "public" && !post.noIndex))) {
    rows.push({
      key: `blog-${post._id}`,
      group: "Blog posts",
      title: post.title,
      meta: `${post.type} · ${post.status}`,
      viewHref: post.status === "published" ? `/blog/${post.slug}` : undefined,
      issues: seoIssues(blogSeoChecks(seoInputOf(post))).map(issue => ({ ...issue, href: `/admin/blog/${post.slug}/edit#${issue.field}` })),
    });
  }

  for (const page of PAGE_SEO_PAGES) {
    rows.push({
      key: `page-${page.key}`,
      group: "Site pages",
      title: page.label,
      meta: page.path,
      viewHref: page.path,
      issues: seoIssues(pageSeoChecks(resolvePageSeo(page, settings.pageSeo?.[page.key]))).map(issue => ({ ...issue, href: `/admin/page-seo?page=${page.key}#${issue.field}` })),
    });
  }

  rows.push({
    key: "organization",
    group: "Site pages",
    title: "Business details",
    meta: "logo and profiles",
    issues: seoIssues(organizationSeoChecks(settings.organization)).map(issue => ({ ...issue, href: `/admin/page-seo?page=organization#${issue.field}` })),
  });

  const liveSlots: HomeImageSlot[] = FEATURES.portfolio ? ["hero", "work-northstar", "work-oasis"] : ["hero"];
  for (const slot of liveSlots) {
    const heroVisual = slot === "hero" ? settings.sectionVisuals?.["home.hero"] : undefined;
    const image: Pick<HomepageImage, "alt"> | undefined = heroVisual
      ? heroVisual.mode !== "pattern" && heroVisual.assetId ? heroVisual : undefined
      : settings.homepageImages?.[slot];
    if (!image) continue;
    rows.push({
      key: `homepage-${slot}`,
      group: "Homepage",
      title: HOMEPAGE_SLOT_LABEL[slot],
      meta: "homepage image",
      viewHref: "/",
      issues: seoIssues(homepageImageSeoChecks(image, slot)).map(issue => ({ ...issue, href: slot === "hero" ? "/admin/visuals?slot=home.hero#visual-alt" : `/admin/homepage?image=${slot}` })),
    });
  }

  for (const asset of assets) {
    rows.push({
      key: `media-${asset._id}`,
      group: "Media library",
      title: asset.altText.trim() || asset.publicId,
      meta: `${asset.format.toUpperCase()} · ${asset.width} × ${asset.height}`,
      issues: seoIssues(mediaSeoChecks(asset)).map(issue => ({ ...issue, href: `/admin/media?asset=${asset._id}` })),
    });
  }

  return rows
    .filter(row => row.issues.length > 0)
    .sort((a, b) => SEO_AUDIT_GROUPS.indexOf(a.group) - SEO_AUDIT_GROUPS.indexOf(b.group) || errors(b) - errors(a) || b.issues.length - a.issues.length);
});

function errors(row: SeoAuditRow) {
  return row.issues.filter(issue => issue.level === "error").length;
}
