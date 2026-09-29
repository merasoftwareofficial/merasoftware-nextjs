import Link from "next/link";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { DoneNotice } from "@/components/done-notice";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { blogRepo, viewRepo, type BlogStatus } from "@/lib/repo";
import { dayKey } from "@/lib/view-rules";

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

/**
 * Server pages render in UTC on Vercel, so a schedule is shown in India time
 * explicitly — the same clock the editor picked it on.
 */
function scheduledAt(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Shown after the editor form sends the user back here, completed with the post's title. */
const DONE_MESSAGE: Record<string, (title: string) => string> = {
  publish: title => `“${title}” is published and live on the blog.`,
  schedule: title => `“${title}” is scheduled. It goes live at the time shown in the list.`,
};

export default async function BlogAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; done?: string; post?: string }>;
}) {
  const user = await requireStaffPage("/admin/blog");

  const { status, sort, done, post: doneSlug } = await searchParams;
  const donePost = done && Object.hasOwn(DONE_MESSAGE, done) && doneSlug ? await blogRepo.findBySlug(doneSlug) : null;
  const byViews = sort === "views";

  // Staff only (requireStaffPage); members follow their own posts at /account/posts.
  const posts = await blogRepo.list({ status: status ? (status as BlogStatus) : undefined });
  // Views over the last 7 days (today and the six before), for the listed posts.
  const week = posts.length ? await viewRepo.sumSince(dayKey(6), posts.map(post => post._id)) : {};
  if (byViews) posts.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  // Filter chips keep the chosen order, and the order toggle keeps the filter.
  const href = (nextStatus: string, nextSort: string) => {
    const query = new URLSearchParams();
    if (nextStatus) query.set("status", nextStatus);
    if (nextSort) query.set("sort", nextSort);
    const text = query.toString();
    return text ? `/admin/blog?${text}` : "/admin/blog";
  };

  // Moderators get a link to the queue carrying the number waiting for them.
  const canReview = atLeast(user.role, "moderator");
  const waiting = canReview ? await blogRepo.count({ status: "pending" }) : 0;

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="CONTENT MANAGEMENT"
        title="Blog posts"
        description="Create, edit, organise and publish articles from one place."
        action={
          <span className="admin-row-actions">
            {canReview ? (
              <Link className="admin-button secondary review-queue-link" href="/admin/blog/review">
                Review queue
                {waiting > 0 ? <span className="review-count">{waiting}</span> : null}
              </Link>
            ) : null}
            <Link className="admin-button" href="/admin/blog/new">
              New post +
            </Link>
          </span>
        }
      />

      {done && donePost ? (
        <DoneNotice
          message={DONE_MESSAGE[done](donePost.title)}
          href={donePost.status === "published" ? `/blog/${donePost.slug}` : undefined}
        />
      ) : null}

      <div className="admin-filters">
        {FILTERS.map(filter => (
          <Link
            key={filter.value}
            href={href(filter.value, byViews ? "views" : "")}
            className={(status ?? "") === filter.value ? "filter-chip on" : "filter-chip"}
          >
            {filter.label}
          </Link>
        ))}
        <Link className={byViews ? "filter-chip on" : "filter-chip"} href={href(status ?? "", byViews ? "" : "views")}>
          {byViews ? "Most viewed ✓" : "Most viewed"}
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="admin-empty">
          <b>No posts yet.</b>
          <br />
          Use &ldquo;New post&rdquo; to write your first article.
        </div>
      ) : (
        <AdminTable
          headers={["TITLE", "TYPE", "CATEGORY", "STATUS", "VIEWS", "7 DAYS", "HELPFUL", "INSIGHTFUL", "SAVES", "UPDATED", "ACTION"]}
          rows={posts.map(post => [
            post.title,
            post.type,
            post.category || "—",
            <span className={`status ${STATUS_CLASS[post.status]}`} key="s">
              {post.status}
              {post.status === "published" && post.noIndex ? " · noindex" : ""}
              {post.status === "scheduled" && post.scheduledFor ? ` · ${scheduledAt(post.scheduledFor)} IST` : ""}
            </span>,
            (post.viewCount ?? 0).toLocaleString("en-IN"),
            (week[post._id] ?? 0).toLocaleString("en-IN"),
            post.helpfulCount ?? 0,
            post.insightfulCount ?? 0,
            post.saveCount ?? 0,
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
