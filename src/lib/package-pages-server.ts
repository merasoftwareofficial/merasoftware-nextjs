import "server-only";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { packagePagePath, resolvedPackagePages } from "@/lib/package-pages";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import type { QuotedPackage } from "@/lib/sales-packages";

/** The package pages, read once per request (header nav, mobile menu and the page share it). */
export const readPackagePages = cache(async () => resolvedPackagePages((await settingsRepo.get()).packagePages));

/** The published packages, each with its own page /package/<id>; none when the portal cannot be reached. */
export const readPublicPackagesOrNone = cache(async (): Promise<QuotedPackage[]> => {
  try { return (await readSalesCatalogue()).packages.filter(item => item.status === "published"); } catch { return []; }
});
/** A package's own page (src/docs/package-offers.md). Its ID never changes, so the link never does. */
export const packagePath = (id: string) => `/package/${encodeURIComponent(id)}`;

/** Where a general "packages" link goes: the first menu page, or contact when no page exists. */
export async function packagesHref() {
  const [first] = await readPackagePages();
  return first ? packagePagePath(first.slug) : "/contact";
}
