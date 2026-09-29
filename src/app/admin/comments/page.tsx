import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { AdminTable } from "@/components/admin-table";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { canDeleteAnyComment } from "@/lib/comment-rules";
import { blogRepo, commentRepo, reportRepo, userRepo, type CommentStatus } from "@/lib/repo";
import { CommentActions, ReportActions } from "./comment-actions";

export const metadata = { title: "Comments" };

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Awaiting review", value: "pending" },
  { label: "Visible", value: "visible" },
  { label: "Hidden", value: "hidden" },
];

function when(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Comment moderation and the report queue.
 *
 * Hide and delete are different powers on purpose: a moderator hides a comment
 * and can show it again, while deleting is the admin's and takes the replies
 * with it. Both go through /api/comments/[id], so this page cannot widen them.
 */
export default async function CommentsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireStaffPage("/admin/comments");

  if (!atLeast(user.role, "moderator")) {
    return (
      <main className="admin-main">
        <AdminHeader
          eyebrow="MODERATION"
          title="Comments"
          description="Only moderators, editors and admins can moderate comments."
        />
        <div className="admin-empty">
          <b>Not allowed.</b>
          <br />
          Your account is a {user.role}.{" "}
          <Link className="admin-action" href="/admin">
            Back to overview →
          </Link>
        </div>
      </main>
    );
  }

  const { status } = await searchParams;
  const canDelete = canDeleteAnyComment(user);
  const [comments, reports, waiting] = await Promise.all([
    commentRepo.list(status ? (status as CommentStatus) : undefined),
    reportRepo.list(false),
    commentRepo.list("pending").then(rows => rows.length),
  ]);

  // Each row names the post it belongs to, so a moderator can judge it in
  // context without opening every article. Posts and reporters are read in
  // one query each, not one per row.
  const [posts, reporters] = await Promise.all([
    blogRepo.findByIds(comments.map(comment => comment.blogId)),
    userRepo.findByIds(reports.map(report => report.userId)),
  ]);
  const postById = new Map(posts.map(post => [post._id, post]));
  const reporterById = new Map(reporters.map(reporter => [reporter._id, reporter]));

  const rows = [];
  for (const comment of comments) {
    const post = postById.get(comment.blogId);
    rows.push([
      <span key="body" className="comment-cell">
        <b>{comment.userName}</b>
        <span>{comment.body}</span>
      </span>,
      post ? (
        <Link key="post" className="text-link" href={`/blog/${post.slug}#comments`} target="_blank">
          {post.title}
        </Link>
      ) : (
        "Deleted post"
      ),
      comment.parentId ? "Reply" : "Comment",
      <span key="status" className={comment.status === "visible" ? "status-live" : "status-draft"}>
        {comment.status}
      </span>,
      when(comment.createdAt),
      <CommentActions key="actions" id={comment._id} status={comment.status} canDelete={canDelete} />,
    ]);
  }

  const reportRows = [];
  for (const report of reports) {
    const reporter = reporterById.get(report.userId);
    reportRows.push([
      report.targetType,
      report.reason,
      reporter?.displayName ?? "Unknown",
      when(report.createdAt),
      <ReportActions key="actions" id={report._id} resolved={report.resolved} />,
    ]);
  }

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="MODERATION"
        title="Comments"
        description="Approve what is waiting, hide what does not belong, and clear the reports."
        action={
          <Link className="admin-button secondary" href="/admin/settings">
            Comment settings
          </Link>
        }
      />

      <div className="admin-filters">
        {FILTERS.map(filter => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/comments?status=${filter.value}` : "/admin/comments"}
            className={(status ?? "") === filter.value ? "is-active" : ""}
          >
            {filter.label}
            {filter.value === "pending" && waiting ? ` (${waiting})` : ""}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="admin-empty">
          <b>No comments here.</b>
          <br />
          Comments readers leave on an article appear in this list.
        </div>
      ) : (
        <AdminTable headers={["Comment", "On post", "Kind", "Status", "Written", ""]} rows={rows} />
      )}

      <section className="admin-section">
        <AdminHeader
          eyebrow="REPORTS"
          title="Open reports"
          description="What readers have flagged and nobody has cleared yet."
        />
        {reportRows.length === 0 ? (
          <div className="admin-empty">
            <b>No open reports.</b>
          </div>
        ) : (
          <AdminTable headers={["Type", "Reason", "Reported by", "When", ""]} rows={reportRows} />
        )}
      </section>
    </main>
  );
}
