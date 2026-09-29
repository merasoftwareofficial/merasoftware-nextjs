import Link from "@/components/link";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo, savedRepo, type Blog } from "@/lib/repo";

export const metadata = { title: "Saved Posts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Saved() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/saved");

  // A saved post that was deleted, unpublished or made private drops out of
  // the list rather than showing as a broken row.
  // The posts are read in one query, then put back in saved order (newest first).
  const rows = await savedRepo.listByUser(user._id);
  const byId = new Map((await blogRepo.findByIds(rows.map(row => row.blogId))).map(post => [post._id, post]));
  const posts: Blog[] = [];
  for (const row of rows) {
    const post = byId.get(row.blogId);
    if (post && isReadable(post, user)) posts.push(post);
  }

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="YOUR ACCOUNT"
          title="Saved posts."
          text="Everything you saved with the Save button, newest first."
        />
        <section className="content-section container">
          {posts.length === 0 ? (
            <div className="admin-empty">
              <b>Nothing saved yet.</b>
              <br />
              Use the Save button on any article and it will wait for you here.{" "}
              <Link className="text-link" href="/blog">
                Browse the blog <span>→</span>
              </Link>
            </div>
          ) : (
            <div className="post-grid">
              {posts.map(post => (
                <Link className="post-card" href={`/blog/${post.slug}`} key={post._id}>
                  <div className="post-copy">
                    <span>{post.category ?? "Insights"}</span>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
