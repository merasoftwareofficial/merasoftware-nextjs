import "server-only";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { packagePagePath, resolvedPackagePages } from "@/lib/package-pages";

/** The package pages, read once per request (header nav, mobile menu and the page share it). */
export const readPackagePages = cache(async () => resolvedPackagePages((await settingsRepo.get()).packagePages));

/** Where a general "packages" link goes: the first menu page, or contact when no page exists. */
export async function packagesHref() {
  const [first] = await readPackagePages();
  return first ? packagePagePath(first.slug) : "/contact";
}
