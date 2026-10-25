import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { readSalesCatalogue, requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { PackagesManager } from "./packages-manager";
import type { SalesCatalogue } from "@/lib/sales-packages";
import { readPackagePages } from "@/lib/package-pages-server";
import { packagePagePath } from "@/lib/package-pages";
export const metadata = { title: "Packages — Admin" };
export default async function AdminPackages() {
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
  const pages = await readPackagePages();
  return <main className="admin-main"><AdminHeader eyebrow="PACKAGES & OFFERS" title="Manage showcase packages" description="Define the scope, project category, pricing, linked offer and the website pages (Pricing & Packages menu) each package is shown on." action={pages[0] ? <Link className="admin-button" href={packagePagePath(pages[0].slug)} target="_blank" rel="noreferrer">Open customer page ↗</Link> : undefined} /><PackagesManager initial={initial} initialPages={pages} /></main>;
}
