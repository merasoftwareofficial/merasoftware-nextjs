/**
 * Search details for the site's fixed pages, editable at /admin/page-seo.
 *
 * Each page has a built-in title and description (below) taken from what the
 * page itself says, so it is never left with the site-wide description. An
 * editor's saved value (settings.pageSeo) replaces the built-in one; clearing
 * a field brings the built-in one back.
 *
 * Every page's generateMetadata calls pageMetadata(key), and the admin page,
 * the API and the SEO audit read allPageSeoPages(), so a page added here shows up
 * everywhere at once. Package pages (lib/package-pages.ts) are created by admins,
 * so they join the fixed list at request time.
 */

import "server-only";

import type { Metadata } from "next";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { packagePagePath } from "@/lib/package-pages";
import { PLANS_PAGE_INTRO, PLANS_PAGE_PATH, PLANS_PAGE_TITLE, planPagePath, planSeoDescription } from "@/lib/public-plans";
import { readPackagePages } from "@/lib/package-pages-server";
import { readPublicPlansOrNone } from "@/lib/public-plans-server";
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
    description: "Strategy, design and technology for local businesses. Explore online presence, website, app, business software and marketing services.",
  },
  ...services.map(service => ({
    key: `service-${service.slug}`,
    label: `Service: ${service.title.split(" — ")[0]}`,
    path: `/services/${service.slug}`,
    title: service.title,
    description: service.description,
  })),
  {
    key: "plans",
    label: "Plans",
    path: PLANS_PAGE_PATH,
    title: PLANS_PAGE_TITLE,
    description: PLANS_PAGE_INTRO,
  },
  {
    key: "about",
    label: "About",
    path: "/about",
    title: "About",
    description: "Established in 2022, Mera Software helps local businesses build their online presence, connect with customers and improve operations through digital solutions.",
  },
  {
    key: "contact",
    label: "Contact",
    path: "/contact",
    title: "Contact",
    description: "Tell us what your business needs. We help you understand your digital options and choose the right service or custom package.",
  },
];

/**
 * The fixed pages plus every package page and every plan on sale (app/plans/[plan]), whose
 * built-in title and description are their own. A plan's key is its id, so a rename keeps its SEO.
 */
export const allPageSeoPages = cache(async (): Promise<SeoPage[]> => {
  const [packagePages, plans] = await Promise.all([readPackagePages(), readPublicPlansOrNone()]);
  return [
    ...PAGE_SEO_PAGES,
    ...packagePages.map(page => ({ key: `packages-${page.slug}`, label: `Packages: ${page.title}`, path: packagePagePath(page.slug), title: page.title, description: page.intro })),
    ...plans.map(plan => ({ key: `plans-${plan._id}`, label: `Plans: ${plan.serviceName}`, path: planPagePath(plan), title: plan.serviceName, description: planSeoDescription(plan) })),
  ];
});

export async function pageSeoPage(key: string) {
  return (await allPageSeoPages()).find(page => page.key === key);
}

const savedPageSeo = cache(async () => (await settingsRepo.get()).pageSeo ?? {});

/** The page's metadata: title, description, canonical, and its share image (or the generated one). */
export async function pageMetadata(key: string): Promise<Metadata> {
  const page = await pageSeoPage(key);
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
