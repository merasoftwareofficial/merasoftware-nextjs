import Link from "@/components/link";
import { PageHero } from "@/components/page-hero";
import { loadVisuals } from "@/lib/section-visuals";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { robotsFor } from "@/lib/indexability";
import { listingIndexable } from "@/lib/indexable-posts";
import { blogRepo } from "@/lib/repo";

/** Indexed while it lists an indexable discussion. */
export async function generateMetadata() {
  return {
    title: "Discussions",
    description: "Questions and practical answers about websites, SEO, ads and digital growth.",
    robots: robotsFor(await listingIndexable("discussion")),
  };
}
export const dynamic = "force-dynamic";

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Approved discussions. A list rather than the /blog card grid: a discussion is
 * a short question, so the title and who asked it are what matter.
 */
export default async function Discussions() {
  const visuals = await loadVisuals(["discussions.hero"]);
  const viewer = await getSessionUser();

  const posts = (await blogRepo.listCards({ type: "discussion", status: "published" })).filter(
    post => post.visibility !== "unlisted" && isReadable(post, viewer),
  );

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="COMMUNITY DISCUSSIONS"
          title="Ask, learn and move forward together."
          text="Short questions, practical tips and focused conversations around websites, SEO, ads and digital growth."
          visual={visuals["discussions.hero"]}
        />
        <section className="content-section container">
          <div className="section-top">
            <p className="eyebrow">
              <i /> LATEST DISCUSSIONS
            </p>
            <Link className="button button-dark" href="/community/write?type=discussion">
              Start a discussion <span>→</span>
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 40 }}>
              <b>No discussions yet.</b>
              <br />
              Ask the first question — it appears here once a moderator approves it.
            </div>
          ) : (
            <div className="discussion-list">
              {posts.map(post => (
                <Link className="discussion-row" href={`/blog/${post.slug}`} key={post._id}>
                  <div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                  </div>
                  <div className="discussion-meta">
                    {post.category ? <span className="discussion-topic">{post.category}</span> : null}
                    <span>{post.authorName}</span>
                    <span>{when(post.publishedAt)}</span>
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
