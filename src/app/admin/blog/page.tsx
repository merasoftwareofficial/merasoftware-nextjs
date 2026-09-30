import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { DoneNotice } from "@/components/done-notice";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { blogRepo, shareRepo, viewRepo, type BlogStatus } from "@/lib/repo";
import { SHARE_PLATFORM_SHORT, SHARE_PLATFORMS } from "@/lib/share-rules";
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
  const byViews = sort === "views";
  const byShares = sort === "shares";

  // Moderators get a link to the queue carrying the number waiting for them.
  const canReview = atLeast(user.role, "moderator");

  // Independent reads go together. Staff only (requireStaffPage); members
  // follow their own posts at /account/posts.
  const [donePost, posts, waiting] = await Promise.all([
    done && Object.hasOwn(DONE_MESSAGE, done) && doneSlug ? blogRepo.findBySlug(doneSlug) : null,
    blogRepo.listCards({ status: status ? (status as BlogStatus) : undefined }),
    canReview ? blogRepo.count({ status: "pending" }) : 0,
  ]);
  // Views and share clicks over the last 7 days (today and the six before),
  // and each post's shares by platform, for the listed posts.
  const ids = posts.map(post => post._id);
  const [week, shareWeek, sharePlatforms]: [
    Record<string, number>,
    Record<string, number>,
    Awaited<ReturnType<typeof shareRepo.byPlatform>>,
  ] = posts.length
    ? await Promise.all([viewRepo.sumSince(dayKey(6), ids), shareRepo.sumSince(dayKey(6), ids), shareRepo.byPlatform(ids)])
    : [{}, {}, {}];
  if (byViews) posts.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  if (byShares) posts.sort((a, b) => (b.shareCount ?? 0) - (a.shareCount ?? 0));
  const sortKey = byViews ? "views" : byShares ? "shares" : "";
  // Filter chips keep the chosen order, and the order toggle keeps the filter.
  const href = (nextStatus: string, nextSort: string) => {
    const query = new URLSearchParams();
    if (nextStatus) query.set("status", nextStatus);
    if (nextSort) query.set("sort", nextSort);
    const text = query.toString();
    return text ? `/admin/blog?${text}` : "/admin/blog";
  };

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
            href={href(filter.value, sortKey)}
            className={(status ?? "") === filter.value ? "filter-chip on" : "filter-chip"}
          >
            {filter.label}
          </Link>
        ))}
        <Link className={byViews ? "filter-chip on" : "filter-chip"} href={href(status ?? "", byViews ? "" : "views")}>
          {byViews ? "Most viewed ✓" : "Most viewed"}
        </Link>
        <Link className={byShares ? "filter-chip on" : "filter-chip"} href={href(status ?? "", byShares ? "" : "shares")}>
          {byShares ? "Most shared ✓" : "Most shared"}
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
          headers={["TITLE", "TYPE", "CATEGORY", "STATUS", "VIEWS", "7 DAYS", "SHARES", "SHARES 7D", "HELPFUL", "INSIGHTFUL", "SAVES", "UPDATED", "ACTION"]}
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
            <span key="sh">
              {(post.shareCount ?? 0).toLocaleString("en-IN")}
              {sharePlatforms[post._id] ? (
                <small className="share-split">
                  {SHARE_PLATFORMS.filter(platform => sharePlatforms[post._id]?.[platform])
                    .map(platform => `${SHARE_PLATFORM_SHORT[platform]} ${sharePlatforms[post._id][platform]}`)
                    .join(" · ")}
                </small>
              ) : null}
            </span>,
            (shareWeek[post._id] ?? 0).toLocaleString("en-IN"),
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
