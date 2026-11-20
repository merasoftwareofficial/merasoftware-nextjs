import { AdminHeader } from "@/components/admin-layout";
import { getSession, requireStaffPage } from "@/lib/auth";
import { BandwidthPanel } from "@/app/admin/communication/bandwidth-panel";

export const metadata = { title: "Bandwidth & processes — Admin" };

/**
 * Standalone admin page for live per-process Render outbound egress, MongoDB BSON traffic,
 * and HTTP response diagnostics (moved out of Communication).
 */
export default async function BandwidthPage() {
  await requireStaffPage("/admin/bandwidth", "admin");
  const session = await getSession();
  const portalAdmin = !!session?.portalRoles.includes("admin");

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="SYSTEM"
        title="Bandwidth & processes"
        description="Live per-process Render outbound egress, MongoDB BSON traffic, and HTTP responses for the last 1 hour or 24 hours."
      />
      {portalAdmin ? (
        <BandwidthPanel active />
      ) : (
        <div className="admin-empty">
          <b>Portal admin only.</b>
          <br />
          System bandwidth diagnostics can be viewed only by an admin who is also a portal admin.
        </div>
      )}
    </main>
  );
}
