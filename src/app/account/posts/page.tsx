import Link from "@/components/link";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { canDelete, canEdit } from "@/lib/blog-rules";
import { blogRepo, type BlogCard, type BlogStatus } from "@/lib/repo";
import { DeleteDraft } from "./delete-draft";

export const metadata = { title: "My Posts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<BlogStatus, string> = {
  draft: "Draft",
  pending: "Waiting for review",
  published: "Published",
  scheduled: "Scheduled",
  rejected: "Rejected",
  archived: "Archived",
};

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Where the author edits this post: members through the community form, official posts in the panel. */
function editHref(post: BlogCard) {
  return post.type === "official" ? `/admin/blog/${post.slug}/edit` : `/community/write?edit=${post.slug}`;
}

/**
 * The signed-in user's own posts in every status, so a member can follow a
 * submission through review without the management panel.
 */
export default async function MyPosts() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/posts");

  const posts = await blogRepo.listCards({ authorId: user._id });

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="YOUR ACCOUNT"
          title="My posts."
          text="Everything you have written, with where each post stands in review."
        />
        <section className="content-section container">
          {posts.length === 0 ? (
            <div className="admin-empty">
              <b>No posts yet.</b>
              <br />
              Write for the community and your drafts and submissions will appear here.{" "}
              <Link className="text-link" href="/community/write">
                Write a post <span>→</span>
              </Link>
            </div>
          ) : (
            <div className="my-posts">
              {posts.map(post => (
                <article className="my-post" key={post._id}>
                  <div className="my-post-meta">
                    <span className={`status ${post.status === "published" ? "status-live" : "status-draft"}`}>
                      {STATUS_LABEL[post.status]}
                    </span>
                    <small>
                      {post.type} · updated {when(post.updatedAt)}
                    </small>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  {post.reviewNote && post.status !== "published" ? (
                    <p className="my-post-note">
                      <b>Moderator note:</b> {post.reviewNote}
                    </p>
                  ) : null}
                  <div className="my-post-actions">
                    {post.status === "published" ? (
                      <Link className="text-link" href={`/blog/${post.slug}`}>
                        View <span>→</span>
                      </Link>
                    ) : null}
                    {canEdit(user, post) ? (
                      <Link className="text-link" href={editHref(post)}>
                        Edit <span>→</span>
                      </Link>
                    ) : null}
                    {canDelete(user, post) && post.status === "draft" ? <DeleteDraft id={post._id} /> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
