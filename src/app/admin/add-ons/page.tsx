import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { readSalesCatalogue, requireSalesAdmin } from "@/lib/sales-catalogue-server";
import type { SalesCatalogue } from "@/lib/sales-packages";
import { AddOnsManager } from "./add-ons-manager";

export const metadata = { title: "Add-ons — Admin" };

export default async function AdminAddOns() {
  await requireStaffPage("/admin/add-ons", "admin");
  let initial: SalesCatalogue | undefined;
  let failure = "";
  try {
    await requireSalesAdmin();
    initial = await readSalesCatalogue(true);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not connect to the portal.";
  }
  if (!initial) {
    return (
      <main className="admin-main">
        <AdminHeader eyebrow="ADD-ONS" title="Add-ons unavailable" description={failure} />
        <Link className="admin-action" href="/admin/add-ons">Try again →</Link>
      </main>
    );
  }
  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="ADD-ONS"
        title="Manage add-ons"
        description="Additional features and upgrades used by custom projects and automatic packages (category + add-ons). Changes to prices apply to new projects and packages; saved packages keep their frozen prices until refreshed."
      />
      <AddOnsManager initial={initial} />
    </main>
  );
}
