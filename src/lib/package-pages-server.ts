import "server-only";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { packagePagePath, resolvedPackagePages } from "@/lib/package-pages";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import { customizable, packageCustomizePath, type QuotedPackage } from "@/lib/sales-packages";
import { PLANS_PAGE_PATH, PLANS_PAGE_TITLE } from "@/lib/public-plans";

/** The package pages, read once per request (header nav, mobile menu and the page share it). */
export const readPackagePages = cache(async () => resolvedPackagePages((await settingsRepo.get()).packagePages));

/** The published packages, each with its own page /package/<id>; none when the portal cannot be reached. */
export const readPublicPackagesOrNone = cache(async (): Promise<QuotedPackage[]> => {
  try { return (await readSalesCatalogue()).packages.filter(item => item.status === "published"); } catch { return []; }
});
/** A package's own page (src/docs/package-offers.md). Its ID never changes, so the link never does. */
export const packagePath = (id: string) => `/package/${encodeURIComponent(id)}`;

/** Package start requests (backend helpers/packageStart.js) are switched on; until then no customize page exists. */
export const packageStartsOn = () => process.env.PACKAGE_START_REQUESTS_ENABLED === "true";
/** Packages with a customize page (src/docs/package.md §3): published, with purchase settings, while requests are on. */
export const readCustomizablePackages = cache(async () => (packageStartsOn() ? (await readPublicPackagesOrNone()).filter(customizable) : []));
export { packageCustomizePath };

/**
 * The "Packages" menu links (admin package pages, then Plans). Shared by the header
 * and the footer so both always list the same pages. A failed read hides the package
 * pages only; Plans is always listed.
 */
export async function packageMenuLinks(): Promise<[string, string][]> {
  let pages: [string, string][] = [];
  try { pages = (await readPackagePages()).map(page => [page.title, packagePagePath(page.slug)] as [string, string]); }
  catch { /* package pages hidden */ }
  return [...pages, [PLANS_PAGE_TITLE, PLANS_PAGE_PATH]];
}

/** Where a general "packages" link goes: the first menu page, or contact when no page exists. */
export async function packagesHref() {
  const [first] = await readPackagePages();
  return first ? packagePagePath(first.slug) : "/contact";
}
