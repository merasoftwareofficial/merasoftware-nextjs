import Link from "@/components/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Comments } from "@/components/blog/comments";
import { Reactions } from "@/components/blog/reactions";
import { ViewBeacon } from "@/components/blog/view-beacon";
import { RichContent, readingTime } from "@/components/editor/rich-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import {
  canDeleteAnyComment,
  canModerateComment,
  commentsAccepted,
  effectiveMode,
  visibleStatuses,
} from "@/lib/comment-rules";
import { blogRepo, commentRepo, reactionRepo, savedRepo, settingsRepo, userRepo } from "@/lib/repo";
import { articleLd, breadcrumbLd, jsonLd, SITE_NAME, SITE_URL } from "@/lib/structured-data";
import { formatViews, viewsVisible } from "@/lib/view-rules";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** The metadata and the page both need the post; cache() makes it one read per request. */
const getPost = cache((slug: string) => blogRepo.findBySlug(slug));

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Article" };

  // A post is its own canonical unless the editor says it first appeared elsewhere.
  const canonical = post.seo?.canonical || `${SITE_URL}/blog/${post.slug}`;

  return {
    title: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    alternates: { canonical },
    // Members-only, private and unlisted posts must never be indexed, and a
    // community post stays out of the index until a moderator allows it.
    robots: post.noIndex || post.visibility !== "public" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: post.seo?.title || post.title,
      description: post.seo?.description || post.excerpt,
      type: "article",
      url: canonical,
      siteName: SITE_NAME,
      publishedTime: post.publishedAt,
      authors: [post.authorName],
      images: post.featuredImage?.url ? [post.featuredImage.url] : undefined,
    },
  };
}

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function Article({ params }: Params) {
  const { slug } = await params;
  const [viewer, post] = await Promise.all([getSessionUser(), getPost(slug)]);

  if (!post) notFound();

  if (!isReadable(post, viewer)) {
    // Members-only content asks for a login; everything else is simply hidden.
    if (post.visibility === "members" && post.status === "published") {
      return (
        <>
          <SiteHeader />
          <main className="article">
            <article className="article-inner">
              <p className="eyebrow">
                <i /> MEMBERS ONLY
              </p>
              <h1>{post.title}</h1>
              <p className="lead">{post.excerpt}</p>
              <div className="admin-empty">
                This article is for signed-in members.{" "}
                <Link className="text-link" href={`/login?next=/blog/${post.slug}`}>
                  Sign in to read it <span>→</span>
                </Link>
              </div>
            </article>
          </main>
          <SiteFooter />
        </>
      );
    }
    notFound();
  }

  // Everything below depends only on the post and the viewer, so it is read in
  // one round instead of six one after another.
  //
  // The byline links to the author's profile. Blog rows store authorId, not the
  // username, so the user is looked up; a deleted author just loses the link.
  //
  // Engagement state is read here rather than fetched by the components, so
  // the thread is in the server HTML and the buttons render already correct.
  const [author, candidates, settings, comments, myReactions, savedRow] = await Promise.all([
    userRepo.findById(post.authorId),
    blogRepo.listCards({ type: post.type, status: "published", visibility: "public" }),
    settingsRepo.get(),
    commentRepo.listByBlog(post._id, visibleStatuses(viewer, post)),
    viewer ? reactionRepo.listByUser(viewer._id, [post._id]) : Promise.resolve([]),
    viewer ? savedRepo.find(viewer._id, post._id) : Promise.resolve(null),
  ]);

  // Related posts stay within the same kind of content: an official article
  // suggests articles, a community post suggests community work.
  //
  // Ranked rather than filtered, because a category match alone left posts
  // with no category showing nothing. A shared category is the strongest
  // signal, then each shared tag, then recency as the tie-break. Anything
  // scoring zero is only used to fill the row when there is nothing better.
  // Among equal scores the more-read post comes first, then the newer one.
  // noIndex stays a check here: posts saved before the field existed lack it,
  // and a `noIndex: false` query would drop them.
  const pool = candidates.filter(item => item._id !== post._id && !item.noIndex);

  const score = (item: (typeof pool)[number]) => {
    let value = 0;
    if (post.category && item.category === post.category) value += 3;
    value += item.tags.filter(tag => post.tags.includes(tag)).length;
    return value;
  };

  const related = pool
    .map(item => ({ item, value: score(item) }))
    .sort((a, b) => b.value - a.value || (b.item.viewCount ?? 0) - (a.item.viewCount ?? 0))
    .slice(0, 3)
    .map(entry => entry.item);

  // Structured data only where the page is genuinely public and indexable.
  // Describing a noindex or members-only post to a crawler contradicts what it
  // is allowed to show, and a staff preview of an unpublished post is not an
  // article the web has.
  const indexable = post.status === "published" && post.visibility === "public" && !post.noIndex;
  const section = post.type === "official" ? ["Insights", "/blog"] : post.type === "discussion" ? ["Discussions", "/discussions"] : ["Community", "/community"];

  return (
    <>
      {indexable ? (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleLd(post, author))} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={jsonLd(
              breadcrumbLd([
                ["Home", "/"],
                [section[0], section[1]],
                [post.title, `/blog/${post.slug}`],
              ]),
            )}
          />
        </>
      ) : null}
      <SiteHeader />
      <main className="article">
        <article className="article-inner">
          <p className="eyebrow">
            <i /> {post.category?.toUpperCase() ?? (post.type === "official" ? "INSIGHTS" : post.type.toUpperCase())}
          </p>
          <h1>{post.title}</h1>
          <p className="article-meta">
            {when(post.publishedAt)} · {readingTime(post.content)} ·{" "}
            {author ? (
              <Link className="text-link" href={`/members/${author.username}`}>
                {post.authorName}
              </Link>
            ) : (
              post.authorName
            )}
            {post.status === "published" && viewsVisible(post, settings) ? ` · ${formatViews(post.viewCount ?? 0)}` : null}
          </p>
          {post.status === "published" ? <ViewBeacon blogId={post._id} /> : null}
          {post.status !== "published" ? (
            <p className="preview-flag">Preview — this post is {post.status} and not public yet.</p>
          ) : null}
          <p className="lead">{post.excerpt}</p>

          {post.featuredImage?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="article-image" src={post.featuredImage.url} alt={post.featuredImage.alt} />
          ) : null}

          <RichContent content={post.content} />

          {post.tags.length ? (
            <div className="article-tags">
              {post.tags.map(tag => (
                <Link key={tag} href={`/topics/${tag.toLowerCase().replace(/\s+/g, "-")}`}>
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}

          <Reactions
            blogId={post._id}
            slug={post.slug}
            signedIn={!!viewer}
            helpfulCount={post.helpfulCount}
            insightfulCount={post.insightfulCount}
            initialHelpful={myReactions.some(row => row.reaction === "helpful")}
            initialInsightful={myReactions.some(row => row.reaction === "insightful")}
            initialSaved={!!savedRow}
          />

          <Comments
            blogId={post._id}
            slug={post.slug}
            comments={comments}
            viewerId={viewer?._id ?? null}
            canModerate={canModerateComment(viewer)}
            canDeleteAny={canDeleteAnyComment(viewer)}
            accepting={commentsAccepted(post, settings)}
            moderated={effectiveMode(post, settings) === "moderated"}
          />
        </article>

        {related.length ? (
          <section className="content-section container">
            <div className="section-top">
              <p className="eyebrow">
                <i /> RELATED READING
              </p>
            </div>
            <div className="post-grid" style={{ marginTop: 32 }}>
              {related.map(item => (
                <Link className="post-card" href={`/blog/${item.slug}`} key={item._id}>
                  <div className="post-copy">
                    <span>{item.category ?? "Insights"}</span>
                    <h3>{item.title}</h3>
                    <p>{item.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
