import Link from "@/components/link";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { robotsFor } from "@/lib/indexability";
import { topicIndexable } from "@/lib/indexable-posts";
import { blogRepo } from "@/lib/repo";
import { topicLabel as label, topicMatches } from "@/lib/topic-slug";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  return {
    title: `${label(slug)} — topic`,
    description: `Articles and community posts about ${label(slug)} from Mera Software.`,
    // Opens to search by itself once enough indexable posts share this topic.
    robots: robotsFor(await topicIndexable(slug)),
  };
}

/**
 * Everything published on one topic, across official, community and discussion
 * posts. A post matches on its category or any of its tags.
 */
export default async function Topic({ params }: Params) {
  const { slug } = await params;
  const viewer = await getSessionUser();

  const posts = (await blogRepo.listCards({ status: "published" })).filter(
    post =>
      post.visibility !== "unlisted" &&
      isReadable(post, viewer) &&
      ((post.category && topicMatches(post.category, slug)) || post.tags.some(tag => topicMatches(tag, slug))),
  );

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="TOPIC"
          title={label(slug)}
          text={`Official articles and approved community posts about ${label(slug)}.`}
        />
        <section className="content-section container">
          {posts.length === 0 ? (
            <div className="admin-empty">
              <b>Nothing published on this topic yet.</b>
              <br />
              <Link className="text-link" href="/blog">
                Browse all articles <span>→</span>
              </Link>
            </div>
          ) : (
            <div className="post-grid">
              {posts.map(post => (
                <Link className="post-card" href={`/blog/${post.slug}`} key={post._id}>
                  {post.featuredImage?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="post-art post-art-image" src={post.featuredImage.url} alt={post.featuredImage.alt} />
                  ) : (
                    <div className="post-art">
                      {label(slug).toUpperCase()}
                      <br />
                      <br />
                      MERA SOFTWARE
                    </div>
                  )}
                  <div className="post-copy">
                    <span>{post.type === "official" ? "Insights" : post.type === "discussion" ? "Discussion" : "Community"}</span>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                    <div className="post-meta">
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
