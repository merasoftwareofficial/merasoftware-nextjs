import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { WhatsappPanel } from "./whatsapp-panel";

export const metadata = { title: "WhatsApp" };
export default async function WhatsappPage() {
  await requireStaffPage("/admin/whatsapp", "admin");
  const session = await getSession();
  const allowed = !!session?.portalRoles.includes("admin");
  return <main className="admin-main">
    <AdminHeader eyebrow="COMMUNICATION" title="WhatsApp" description="Every email that is sent also goes out on WhatsApp, one message at a time." />
    {allowed ? <WhatsappPanel /> : <p>WhatsApp can be managed only by an admin who is also a portal admin.</p>}
  </main>;
}
