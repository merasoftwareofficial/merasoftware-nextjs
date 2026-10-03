import { AdminLayout } from "@/components/admin-layout";
import { atLeast, getSessionUser } from "@/lib/auth";
import { pushPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // The shell hides nav entries this user cannot open; each page still checks.
  const user = await getSessionUser();
  // Admin alerts are for admins only; the alert route checks the role again.
  const pushKey = user && atLeast(user.role, "admin") ? pushPublicKey() : null;
  return <AdminLayout role={user?.role} pushKey={pushKey}>{children}</AdminLayout>;
}
