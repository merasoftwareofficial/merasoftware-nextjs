import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/blog/search-box";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo } from "@/lib/repo";

export const metadata = {
  title: "Community",
  description: "Practical articles written by Mera Software members and approved by our moderators.",
};
export const dynamic = "force-dynamic";

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Approved member articles. Only published community posts appear, and unlisted
 * ones are reachable by link but never listed — the same rule /blog follows.
 */
export default async function Community({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await getSessionUser();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  const posts = (await blogRepo.list({ type: "community", status: "published", search: term || undefined })).filter(
    post => post.visibility !== "unlisted" && isReadable(post, viewer),
  );

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="MERA COMMUNITY"
          title="Useful ideas are better when they are shared."
          text="A moderated space for practical digital marketing, website and business-growth learning from Mera Software and its members."
        />
        <section className="content-section container">
          <Suspense fallback={null}>
            <SearchBox action="/community" placeholder="Search community posts" />
          </Suspense>

          {term ? (
            <p className="search-summary">
              {posts.length === 0
                ? `Nothing found for “${term}”.`
                : `${posts.length} ${posts.length === 1 ? "post" : "posts"} for “${term}”.`}
            </p>
          ) : null}

          <div className="section-top">
            <p className="eyebrow">
              <i /> COMMUNITY ARTICLES
            </p>
            <Link className="button button-dark" href="/community/write">
              Write a post <span>→</span>
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 40 }}>
              <b>No community articles yet.</b>
              <br />
              Members can submit an article for review; approved posts appear here.
            </div>
          ) : (
            <div className="post-grid" style={{ marginTop: 32 }}>
              {posts.map(post => (
                <Link className="post-card" href={`/blog/${post.slug}`} key={post._id}>
                  {post.featuredImage?.url ? (
                    // Remote image hosts are not configured for next/image yet.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="post-art post-art-image" src={post.featuredImage.url} alt={post.featuredImage.alt} />
                  ) : (
                    <div className="post-art">
                      {(post.category ?? "COMMUNITY").toUpperCase()}
                      <br />
                      <br />
                      MERA
                      <br />
                      COMMUNITY
                    </div>
                  )}
                  <div className="post-copy">
                    <span>{post.category ?? "Community"}</span>
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
