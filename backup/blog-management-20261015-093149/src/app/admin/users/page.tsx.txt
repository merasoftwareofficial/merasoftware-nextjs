import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { userRepo } from "@/lib/repo";
import { UserActions } from "./user-actions";

export const metadata = { title: "Users" };

function when(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Website users: blog role and ban. Accounts are created and signed in on the
 * client portal (src/docs/login.md); this page manages only the website profile.
 */
export default async function UsersAdmin() {
  const user = await requireStaffPage("/admin/users");

  if (!atLeast(user.role, "admin")) {
    return (
      <main className="admin-main">
        <AdminHeader eyebrow="ACCESS CONTROL" title="Users" description="Only admins can manage users." />
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

  const users = await userRepo.list();

  const rows = users.map(row => [
    <Link key="name" className="text-link" href={`/members/${row.username}`} target="_blank">
      {row.displayName}
    </Link>,
    row.email,
    row._id === user._id ? `${user.role} (you)` : row.role,
    row.banned ? "Banned" : "Active",
    when(row.createdAt),
    row._id === user._id ? (
      "—"
    ) : (
      <UserActions key="actions" id={row._id} role={row.role} banned={row.banned} />
    ),
  ]);

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="ACCESS CONTROL"
        title="Users"
        description="Blog role and ban for everyone who has signed in to the website. A client portal admin is always an admin here."
      />
      {rows.length ? (
        <AdminTable headers={["User", "Email", "Blog role", "Status", "Joined", "Actions"]} rows={rows} />
      ) : (
        <div className="admin-empty">No one has signed in to the website yet.</div>
      )}
    </main>
  );
}
