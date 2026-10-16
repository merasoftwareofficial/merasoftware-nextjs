import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { EmailControlPanel } from "./email-control-panel";

export const metadata = { title: "Email Control" };
export default async function EmailControlPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaffPage("/admin/email-control", "admin");
  const session = await getSession();
  const canManagePortal = !!session?.portalRoles.includes("admin");
  const { tab } = await searchParams;
  return <main className="admin-main">
    <AdminHeader eyebrow="COMMUNICATION" title="Email Control" description="Website and portal templates, sending rules and email decisions." />
    <EmailControlPanel initialApplication={tab === "portal" && canManagePortal ? "portal" : "website"} canManagePortal={canManagePortal} />
  </main>;
}
