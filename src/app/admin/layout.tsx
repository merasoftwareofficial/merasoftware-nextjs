import { AdminLayout } from "@/components/admin-layout";
import { atLeast, getSession } from "@/lib/auth";
import { pushPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // The shell hides nav entries this user cannot open; each page still checks.
  const session = await getSession();
  const user = session?.user;
  // Admin alerts are for admins only; the alert route checks the role again.
  const pushKey = user && atLeast(user.role, "admin") ? pushPublicKey() : null;
  return <AdminLayout role={user?.role} pushKey={pushKey} salesAdmin={!!session?.portalRoles.includes("admin") && session?.portalActiveRole === "admin"}>{children}</AdminLayout>;
}
