import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { readSalesCatalogue, requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { PackagesManager } from "./packages-manager";
import type { SalesCatalogue } from "@/lib/sales-packages";
import { readPackagePages } from "@/lib/package-pages-server";
import { packagePagePath } from "@/lib/package-pages";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
export const metadata = { title: "Packages — Admin" };
// The one package form (src/docs/package-offers.md): packages, their page design and their offers.
// ?package=<id> opens that package (links from Offers and from an offer's old edit link).
export default async function AdminPackages({ searchParams }: { searchParams: Promise<{ package?: string }> }) {
  await requireStaffPage("/admin/packages", "admin");
  let initial: SalesCatalogue | undefined;
  let failure = "";
  try {
    await requireSalesAdmin();
    initial = await readSalesCatalogue(true);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not connect to the portal.";
  }
  if (!initial) return <main className="admin-main"><AdminHeader eyebrow="PACKAGES" title="Packages unavailable" description={failure} /><Link className="admin-action" href="/admin/packages">Try again →</Link></main>;
  const [pages, settings, query] = await Promise.all([readPackagePages(), settingsRepo.get(), searchParams]);
  return <main className="admin-main"><AdminHeader eyebrow="PACKAGES & OFFERS" title="Manage packages and offers" description="Each package has its own page. Add an offer to a package to show 3 prices and a countdown; without one the page shows 2 prices." action={pages[0] ? <Link className="admin-button" href={packagePagePath(pages[0].slug)} target="_blank" rel="noreferrer">Open customer page ↗</Link> : undefined} />
    <PackagesManager key={query.package || "list"} initial={initial} initialPages={pages} initialOffers={resolvedOffers(settings.offers)} universalTerms={settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS} openPackageId={query.package} /></main>;
}
