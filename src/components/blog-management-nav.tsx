import Link from "@/components/link";
import { getSessionUser } from "@/lib/auth";
import { blogManagementGroups } from "@/lib/blog-management";
import s from "@/app/admin/blog-management/management.module.css";

export async function BlogManagementNav() {
  const user = await getSessionUser();
  if (!user) return null;
  const groups = blogManagementGroups(user.role);
  if (!groups.length) return null;
  return <nav className={s.navigation} aria-label="Blog management">
    <Link className={s.home} href="/admin/blog-management">← Blog Management</Link>
    <div className={s.shortcuts}>{groups.flatMap(group => group.items).map(item =>
      <Link href={item.href} key={item.href}>{item.label}</Link>
    )}</div>
  </nav>;
}
