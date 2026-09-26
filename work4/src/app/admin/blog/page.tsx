import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { getSessionUser } from "@/lib/auth";
import { blogRepo, type BlogStatus } from "@/lib/repo";

export const metadata = { title: "Blog posts" };

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Published", value: "published" },
  { label: "Drafts", value: "draft" },
  { label: "Pending review", value: "pending" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Rejected", value: "rejected" },
  { label: "Archived", value: "archived" },
];

const STATUS_CLASS: Record<BlogStatus, string> = {
  published: "status-live",
  draft: "status-draft",
  pending: "status-draft",
  scheduled: "status-draft",
  rejected: "status-draft",
  archived: "status-draft",
};

function when(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function BlogAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/blog");

  const { status } = await searchParams;

  // Members see only their own posts; staff see everything.
  const posts = await blogRepo.list({
    status: status ? (status as BlogStatus) : undefined,
    authorId: user.role === "member" ? user._id : undefined,
  });

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="CONTENT MANAGEMENT"
        title="Blog posts"
        description="Create, edit, organise and publish articles from one place."
        action={
          <Link className="admin-button" href="/admin/blog/new">
            New post +
          </Link>
        }
      />

      <div className="admin-filters">
        {FILTERS.map(filter => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/blog?status=${filter.value}` : "/admin/blog"}
            className={(status ?? "") === filter.value ? "filter-chip on" : "filter-chip"}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="admin-empty">
          <b>No posts yet.</b>
          <br />
          Use &ldquo;New post&rdquo; to write your first article.
        </div>
      ) : (
        <AdminTable
          headers={["TITLE", "TYPE", "CATEGORY", "STATUS", "UPDATED", "ACTION"]}
          rows={posts.map(post => [
            post.title,
            post.type,
            post.category || "—",
            <span className={`status ${STATUS_CLASS[post.status]}`} key="s">
              {post.status}
              {post.status === "published" && post.noIndex ? " · noindex" : ""}
            </span>,
            when(post.updatedAt),
            <span className="admin-row-actions" key="a">
              <Link className="admin-action" href={`/admin/blog/${post.slug}/edit`}>
                Edit →
              </Link>
              {post.status === "published" ? (
                <Link className="admin-action" href={`/blog/${post.slug}`} target="_blank">
                  View ↗
                </Link>
              ) : null}
            </span>,
          ])}
        />
      )}
    </main>
  );
}
