/**
 * Search details for the site's fixed pages, editable at /admin/page-seo.
 *
 * Each page has a built-in title and description (below) taken from what the
 * page itself says, so it is never left with the site-wide description. An
 * editor's saved value (settings.pageSeo) replaces the built-in one; clearing
 * a field brings the built-in one back.
 *
 * Every page's generateMetadata calls pageMetadata(key), and the admin page,
 * the API and the SEO audit read PAGE_SEO_PAGES, so a page added here shows up
 * everywhere at once.
 */

import "server-only";

import type { Metadata } from "next";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { resolvePageSeo, type SeoPage } from "@/lib/seo-rules";
import { services } from "@/lib/site-data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/structured-data";

export const PAGE_SEO_PAGES: SeoPage[] = [
  { key: "home", label: "Home", path: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
  {
    key: "services",
    label: "Services",
    path: "/services",
    title: "Services",
    description: "Every engagement starts with the business outcome. Then we choose the right tools, channels and pace to get there.",
  },
  ...services.map(service => ({
    key: `service-${service.slug}`,
    label: `Service: ${service.title.split(" — ")[0]}`,
    path: `/services/${service.slug}`,
    title: service.title,
    description: service.description,
  })),
  {
    key: "about",
    label: "About",
    path: "/about",
    title: "About",
    description: "We pair strategic clarity with considered digital execution, so your marketing feels connected instead of cobbled together.",
  },
  {
    key: "contact",
    label: "Contact",
    path: "/contact",
    title: "Contact",
    description: "Share a little about your business, the challenge and where you want to go. We'll come back with a useful next step.",
  },
];

export function pageSeoPage(key: string) {
  return PAGE_SEO_PAGES.find(page => page.key === key);
}

const savedPageSeo = cache(async () => (await settingsRepo.get()).pageSeo ?? {});

/** The page's metadata: title, description, canonical, and its share image (or the generated one). */
export async function pageMetadata(key: string): Promise<Metadata> {
  const page = pageSeoPage(key);
  if (!page) return {};
  const seo = resolvePageSeo(page, (await savedPageSeo())[key]);
  const image = seo.imageUrl
    ? { url: seo.imageUrl, alt: seo.imageAlt || seo.shortTitle }
    : { url: `/og?${new URLSearchParams({ title: page.key === "home" ? SITE_TITLE : seo.shortTitle })}`, width: 1200, height: 630, alt: seo.shortTitle };
  return {
    title: page.key === "home" ? { absolute: seo.title } : seo.shortTitle,
    description: seo.description,
    alternates: { canonical: page.path },
    openGraph: { title: seo.title, description: seo.description, url: `${SITE_URL}${page.path === "/" ? "" : page.path}`, siteName: SITE_NAME, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description, images: [image.url] },
  };
}
