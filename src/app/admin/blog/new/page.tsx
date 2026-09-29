import Link from "next/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { BlogForm } from "../blog-form";

export const metadata = { title: "New article" };

export default async function NewBlog() {
  const user = await requireStaffPage("/admin/blog/new");

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="BLOG POSTS"
        title="New article"
        description="Write the article, set its SEO details, then save it as a draft or publish it."
        action={
          <Link className="admin-button secondary" href="/admin/blog">
            Cancel
          </Link>
        }
      />
      <BlogForm role={user.role} />
    </main>
  );
}
