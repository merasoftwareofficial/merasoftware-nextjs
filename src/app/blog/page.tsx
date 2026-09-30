import Link from "@/components/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/blog/search-box";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { robotsFor } from "@/lib/indexability";
import { listingIndexable } from "@/lib/indexable-posts";
import { blogRepo, viewRepo } from "@/lib/repo";
import { breadcrumbLd, jsonLd, organisationLd } from "@/lib/structured-data";
import { dayKey } from "@/lib/view-rules";

type Search = { searchParams: Promise<{ q?: string }> };

/** Indexed while it lists an indexable article; a search result page never is. */
export async function generateMetadata({ searchParams }: Search) {
  const { q } = await searchParams;
  return {
    title: "Insights",
    description: "Clear thinking about websites, search and growth from Mera Software.",
    robots: robotsFor(!q?.trim() && (await listingIndexable("official"))),
  };
}
export const dynamic = "force-dynamic";

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function BlogPage({ searchParams }: Search) {
  const viewer = await getSessionUser();
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  // Unlisted posts are reachable by link but must not appear in listings.
  // The search itself runs in the repo, so the MongoDB driver can answer it
  // with a query instead of filtering in memory.
  const posts = (await blogRepo.listCards({ type: "official", status: "published", search: term || undefined }))
    .filter(post => post.visibility !== "unlisted" && isReadable(post, viewer));

  // Most-read articles of the last 7 days (today and the six before), drawn from
  // the same list so nothing hidden can surface. The counts themselves are not
  // shown here: whether readers see view counts is the admin's setting.
  let popular: typeof posts = [];
  if (!term && posts.length) {
    const week = await viewRepo.sumSince(dayKey(6), posts.map(post => post._id));
    popular = posts
      .filter(post => (week[post._id] ?? 0) > 0)
      .sort((a, b) => week[b._id] - week[a._id])
      .slice(0, 3);
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organisationLd())} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbLd([
            ["Home", "/"],
            ["Insights", "/blog"],
          ]),
        )}
      />
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="INSIGHTS"
          title="Ideas for doing digital work better."
          text="Clear thinking about websites, search and growth — made for people building real businesses."
        />
        <section className="content-section container">
          {/* useSearchParams needs a Suspense boundary in a server page. */}
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>

          {popular.length ? (
            <section className="popular-week" aria-labelledby="popular-week-title">
              <p className="eyebrow" id="popular-week-title">
                <i /> POPULAR THIS WEEK
              </p>
              <ol>
                {popular.map(post => (
                  <li key={post._id}>
                    <Link href={`/blog/${post.slug}`}>
                      <b>{post.title}</b>
                      <span>{post.category ?? "Insights"}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {term ? (
            <p className="search-summary">
              {posts.length === 0
                ? `Nothing found for “${term}”.`
                : `${posts.length} ${posts.length === 1 ? "article" : "articles"} for “${term}”.`}
            </p>
          ) : null}

          {posts.length === 0 ? (
            <div className="admin-empty">
              <b>{term ? "No articles match that search." : "No articles published yet."}</b>
              <br />
              {term ? (
                <>
                  Try a different word, or{" "}
                  <Link className="text-link" href="/blog">
                    see every article <span>→</span>
                  </Link>
                </>
              ) : (
                "New articles will appear here as soon as they are published."
              )}
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
