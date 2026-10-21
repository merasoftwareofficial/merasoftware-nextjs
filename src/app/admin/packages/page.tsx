import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { readSalesCatalogue, requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { PackagesManager } from "./packages-manager";
import type { SalesCatalogue } from "@/lib/sales-packages";
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
  return <main className="admin-main"><AdminHeader eyebrow="PACKAGES & OFFERS" title="Manage showcase packages" description="Define the scope, project category, pricing and linked offer used when an admin prepares a project." action={<Link className="admin-button" href="/campaign/packages" target="_blank" rel="noreferrer">Open customer page ↗</Link>} /><PackagesManager initial={initial} /></main>;
}
