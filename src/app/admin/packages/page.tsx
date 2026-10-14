import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { StaffPackages } from "@/components/campaign/staff-packages";
import { requireStaffPage } from "@/lib/auth";
export const metadata = { title: "Packages — Admin" };
export default async function AdminPackages() {
  await requireStaffPage("/admin/packages", "editor");
  return <main className="admin-main"><AdminHeader eyebrow="SALES REFERENCE" title="Promotion packages" description="Compare existing packages, copy summaries and review quotation notes. Package pricing is maintained in the website source." action={<Link className="admin-button" href="/campaign/packages" target="_blank" rel="noreferrer">Open customer page ↗</Link>} /><StaffPackages staff /></main>;
}
