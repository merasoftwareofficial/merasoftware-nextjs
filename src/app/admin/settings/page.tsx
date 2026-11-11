import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { atLeast, getSession, requireStaffPage } from "@/lib/auth";
import BusinessSettings from './business-settings';

export const metadata = { title: "Site settings" };

export default async function Settings() {
  const user = await requireStaffPage("/admin/settings");
  const session = await getSession();

  if (!atLeast(user.role, "admin")) {
    return (
      <main className="admin-main">
        <AdminHeader eyebrow="SITE SETTINGS" title="Site settings" description="Only an admin can change these." />
        <div className="admin-empty">
          <b>Not allowed.</b>
          <br />
          Your account is a {user.role}.{" "}
          <Link className="admin-action" href="/admin">
            Back to overview →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="SITE SETTINGS"
        title="Business details"
        description="Manage invoice details and your team notification contacts."
      />

      <p><Link className="admin-action" href="/admin/blog-management/settings">Comments, views and sharing settings → Blog Management</Link></p>

      <p><Link className="admin-action" href="/admin/communication">Communication — email and WhatsApp templates, rules, approvals and history →</Link></p>
      {session?.portalRoles.includes('admin') ? <BusinessSettings contactEndpoint="/api/admin-contact-settings" invoiceEndpoint="/api/invoice-settings" /> : <p className="admin-empty">Link a portal admin account to manage team contacts and invoice business details.</p>}
    </main>
  );
}
