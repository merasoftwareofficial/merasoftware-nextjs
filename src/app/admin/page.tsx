import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-layout";
import { atLeast, getSessionUser } from "@/lib/auth";
import { activeDriver, blogRepo, commentRepo, reportRepo } from "@/lib/repo";

export const metadata = { title: "Admin workspace" };

/**
 * The admin overview.
 *
 * Signed out, this page used to render the whole shell to anybody — every
 * other admin page redirects, so it was the one way in. The counts were also
 * hardcoded; they are read from the repo now, because a workspace showing
 * invented numbers is worse than one showing none.
 */
export default async function Admin() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");

  const published = await blogRepo.count({ status: "published" });
  const canReview = atLeast(user.role, "moderator");
  const pendingPosts = canReview ? await blogRepo.count({ status: "pending" }) : 0;
  const pendingComments = canReview ? (await commentRepo.list("pending")).length : 0;
  const openReports = canReview ? (await reportRepo.list(false)).length : 0;
  const mine = await blogRepo.count({ authorId: user._id });

  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="ADMIN WORKSPACE"
        title={`Welcome, ${user.displayName}.`}
        description={`You are signed in as ${user.role}. Storage is the ${activeDriver} driver.`}
        action={
          <Link className="admin-button" href="/admin/blog/new">
            New blog post +
          </Link>
        }
      />

      <div className="admin-stats">
        <div className="admin-stat">
          <span>PUBLISHED POSTS</span>
          <strong>{pad(published)}</strong>
          <small>Live on the website</small>
        </div>
        <div className="admin-stat">
          <span>YOUR POSTS</span>
          <strong>{pad(mine)}</strong>
          <small>Everything you have written</small>
        </div>
        {canReview ? (
          <>
            <div className="admin-stat">
              <span>AWAITING REVIEW</span>
              <strong>{pad(pendingPosts)}</strong>
              <small>Member submissions</small>
            </div>
            <div className="admin-stat">
              <span>COMMENTS HELD</span>
              <strong>{pad(pendingComments)}</strong>
              <small>{openReports ? `${openReports} open report${openReports === 1 ? "" : "s"}` : "No open reports"}</small>
            </div>
          </>
        ) : null}
      </div>

      <div className="admin-grid">
        <section className="admin-panel">
          <h2>Next actions</h2>
          <Link href="/admin/blog/new">Write a blog post <span>→</span></Link>
          {canReview ? (
            <>
              <Link href="/admin/blog/review">Review submissions <span>→</span></Link>
              <Link href="/admin/comments">Moderate comments <span>→</span></Link>
            </>
          ) : (
            <Link href="/community/write">Write a community post <span>→</span></Link>
          )}
          {atLeast(user.role, "admin") ? <Link href="/admin/settings">Site settings <span>→</span></Link> : null}
        </section>

        <section className="admin-panel">
          <h2>Integration status</h2>
          <p>
            <b>{activeDriver === "json" ? "Local JSON storage" : "MongoDB"}</b> is active.
          </p>
          <p>
            MongoDB, Firebase Auth and Cloudinary will use environment variables from <code>.env.local</code> when
            configured.
          </p>
        </section>
      </div>
    </main>
  );
}
