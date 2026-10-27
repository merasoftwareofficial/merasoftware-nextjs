import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { readPlanCatalogue } from "@/lib/service-plans-server";
import type { PlanCatalogue } from "@/lib/service-plans";
import { PlansManager } from "./plans-manager";
export const metadata = { title: "Plans — Admin" };
export default async function AdminPlans() {
  await requireStaffPage("/admin/plans", "admin");
  let initial: PlanCatalogue | undefined;
  let failure = "";
  try {
    await requireSalesAdmin();
    initial = await readPlanCatalogue();
  } catch (error) {
    failure = error instanceof Error ? error.message : "Could not connect to the portal.";
  }
  if (!initial) return <main className="admin-main"><AdminHeader eyebrow="PLANS" title="Plans unavailable" description={failure} /><Link className="admin-action" href="/admin/plans">Try again →</Link></main>;
  return <main className="admin-main"><AdminHeader eyebrow="PLANS" title="Manage plans" description="Repeat or ongoing work your clients buy in the portal: what each plan includes, how it is priced and which category it belongs to. Prices are always worked out by the portal." /><PlansManager initial={initial} /></main>;
}
