import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { canEdit } from "@/lib/blog-rules";
import { blogRepo } from "@/lib/repo";
import { BlogForm } from "../../blog-form";

export default async function EditBlog({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireStaffPage(`/admin/blog/${slug}/edit`);

  const blog = await blogRepo.findBySlug(slug);
  if (!blog) notFound();

  if (!canEdit(user, blog)) {
    return (
      <main className="admin-main">
        <AdminHeader eyebrow="EDIT ARTICLE" title="Not allowed" description="You cannot edit this post." />
        <div className="admin-empty">
          This post belongs to {blog.authorName}. Ask an editor or moderator to make changes.
        </div>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="EDIT ARTICLE"
        title="Update post"
        description={`Editing: ${blog.title}`}
        action={
          <Link className="admin-button secondary" href="/admin/blog">
            Back to list
          </Link>
        }
      />
      {blog.reviewNote ? (
        <div className="admin-empty review-note">
          <b>Moderator note:</b> {blog.reviewNote}
        </div>
      ) : null}
      <BlogForm blog={blog} type={blog.type} role={user.role} />
    </main>
  );
}
