import { AdminLayout } from "@/components/admin-layout";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  // The shell hides nav entries this user cannot open; each page still checks.
  const user = await getSessionUser();
  return <AdminLayout role={user?.role}>{children}</AdminLayout>;
}
