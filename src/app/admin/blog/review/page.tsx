import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { RichContent, readingTime } from "@/components/editor/rich-content";
import { atLeast, getSessionUser } from "@/lib/auth";
import { blogRepo } from "@/lib/repo";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "Review queue" };

/**
 * The moderation queue — what stops this becoming a spam and backlink site.
 *
 * Everything a member submits lands here as pending and noIndex. A moderator
 * reads the post in full on this page and approves, rejects or sends it back.
 * The decision goes through /api/blogs/[id]/status, so the rules are enforced
 * server-side whatever this page shows.
 */
export default async function ReviewQueue() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin/blog/review");

  // Members must never see other people's unpublished work.
  if (!atLeast(user.role, "moderator")) {
    return (
      <main className="admin-main">
        <AdminHeader
          eyebrow="MODERATION"
          title="Review queue"
          description="Only moderators, editors and admins can review submissions."
        />
        <div className="admin-empty">
          <b>Not allowed.</b>
          <br />
          Your account is a {user.role}.{" "}
          <Link className="admin-action" href="/admin/blog">
            Back to posts →
          </Link>
        </div>
      </main>
    );
  }

  const pending = await blogRepo.list({ status: "pending" });

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="MODERATION"
        title="Review queue"
        description="Read each submission, then approve it, reject it or send it back with a note."
        action={
          <Link className="admin-button secondary" href="/admin/blog">
            All posts
          </Link>
        }
      />

      {pending.length === 0 ? (
        <div className="admin-empty">
          <b>Nothing waiting for review.</b>
          <br />
          Member submissions appear here as soon as they are sent for review.
        </div>
      ) : (
        <div className="review-queue">
          {pending.map(post => (
            <article className="review-item" key={post._id}>
              <div className="review-head">
                <div>
                  <p className="eyebrow">
                    <i /> {post.type.toUpperCase()}
                    {post.category ? ` · ${post.category}` : ""}
                  </p>
                  <h2>{post.title}</h2>
                  <p className="review-by">
                    {post.authorName} · {readingTime(post.content)} · submitted{" "}
                    {new Date(post.updatedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <Link className="admin-action" href={`/blog/${post.slug}`} target="_blank">
                  Preview ↗
                </Link>
              </div>

              <p className="review-excerpt">{post.excerpt}</p>

              {post.tags.length ? (
                <p className="review-tags">{post.tags.map(tag => `#${tag}`).join("  ")}</p>
              ) : null}

              {/* The whole post is shown here — a decision should not need a second page. */}
              <details className="review-body">
                <summary>Read the full post</summary>
                <RichContent content={post.content} />
              </details>

              <ReviewActions id={post._id} type={post.type} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
