/**
 * Package pages: the entries of the header's "Pricing & Packages" menu, each served at
 * /packages/[slug] and showing the published packages that list the page (package.pages,
 * saved in the portal backend). The website owns this list (settings.packagePages); the
 * backend reads it from /api/offers/live to check a package's pages when it is saved.
 *
 * Until an admin first creates or deletes a page the setting is absent and the default list
 * below applies. The first change saves that default list, so deleting every page leaves the
 * menu empty instead of bringing the default back. A slug is permanent: pages are created and
 * deleted, never renamed.
 */

import { z } from "zod";
import { slugify } from "@/lib/slug";

export type PackagePage = { slug: string; title: string; intro: string; order: number };

export const DEFAULT_PACKAGE_PAGES: Record<string, PackagePage> = {
  "one-time-packages": {
    slug: "one-time-packages",
    title: "One-Time Packages",
    intro: "Compare one-time website and business setup packages. We confirm the scope, timeline and applicable taxes before payment. Our team prepares your project in the client portal.",
    order: 0,
  },
};

export const resolvedPackagePages = (saved: Record<string, PackagePage> | undefined): PackagePage[] =>
  Object.values(saved ?? DEFAULT_PACKAGE_PAGES).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const packagePagePath = (slug: string) => `/packages/${slug}`;

/** What an admin sends to create a page; slug and order are worked out on the server. */
export const newPackagePageSchema = z.object({
  title: z.string().trim().min(2).max(80),
  intro: z.string().trim().min(10).max(500),
}).strict();

export const packagePageSlug = (title: string) => slugify(title).slice(0, 80).replace(/-$/, "");
export const isPackagePageSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
