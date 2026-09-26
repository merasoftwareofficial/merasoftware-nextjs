import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo } from "@/lib/repo";

export const metadata = {
  title: "Insights",
  description: "Clear thinking about websites, search and growth from Mera Software.",
};

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BlogPage() {
  const viewer = await getSessionUser();

  // Unlisted posts are reachable by link but must not appear in listings.
  const posts = (await blogRepo.list({ type: "official", status: "published" }))
    .filter(post => post.visibility !== "unlisted" && isReadable(post, viewer));

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="INSIGHTS"
          title="Ideas for doing digital work better."
          text="Clear thinking about websites, search and growth — made for people building real businesses."
        />
        <section className="content-section container">
          {posts.length === 0 ? (
            <div className="admin-empty">
              <b>No articles published yet.</b>
              <br />
              New articles will appear here as soon as they are published.
            </div>
          ) : (
            <div className="post-grid">
              {posts.map(post => (
                <Link className="post-card" href={`/blog/${post.slug}`} key={post._id}>
                  {post.featuredImage?.url ? (
                    // Remote image hosts are not configured for next/image yet.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="post-art post-art-image" src={post.featuredImage.url} alt={post.featuredImage.alt} />
                  ) : (
                    <div className="post-art">
                      {(post.category ?? "MERA SOFTWARE").toUpperCase()}
                      <br />
                      <br />
                      MERA SOFTWARE
                      <br />
                      INSIGHTS
                    </div>
                  )}
                  <div className="post-copy">
                    <span>{post.category ?? "Insights"}</span>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                    <div className="post-meta">
                      <span>{when(post.publishedAt)}</span>
                      <span>{post.authorName}</span>
                    </div>
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
