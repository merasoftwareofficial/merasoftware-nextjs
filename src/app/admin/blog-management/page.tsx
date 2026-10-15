import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { blogManagementGroups } from "@/lib/blog-management";
import s from "./management.module.css";

export const metadata = { title: "Blog Management" };
export default async function BlogManagement() {
  const user = await requireStaffPage("/admin/blog-management");
  return <main className="admin-main">
    <AdminHeader eyebrow="BLOG WORKSPACE" title="Blog Management" description="Posts, submissions, comments and blog access in one place." />
    <div className={s.groups}>{blogManagementGroups(user.role).map(group =>
      <section className={s.group} key={group.label}>
        <h2>{group.label}</h2>
        {group.items.map(item => <Link className={s.item} href={item.href} key={item.href}>
          <div><h3>{item.label}</h3><p>{item.description}</p></div><span aria-hidden="true">→</span>
        </Link>)}
      </section>
    )}</div>
  </main>;
}
