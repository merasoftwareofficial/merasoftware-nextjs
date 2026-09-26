import Link from "next/link";
import { notFound } from "next/navigation";
import { RichContent, readingTime } from "@/components/editor/rich-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo } from "@/lib/repo";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const post = await blogRepo.findBySlug(slug);
  if (!post) return { title: "Article" };

  return {
    title: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    alternates: post.seo?.canonical ? { canonical: post.seo.canonical } : undefined,
    // Members-only, private and unlisted posts must never be indexed, and a
    // community post stays out of the index until a moderator allows it.
    robots: post.noIndex || post.visibility !== "public" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: post.seo?.title || post.title,
      description: post.seo?.description || post.excerpt,
      type: "article",
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
  const viewer = await getSessionUser();
  const post = await blogRepo.findBySlug(slug);

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

  const related = (await blogRepo.list({ type: "official", status: "published", category: post.category, limit: 4 }))
    .filter(item => item._id !== post._id && item.visibility === "public")
    .slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main className="article">
        <article className="article-inner">
          <p className="eyebrow">
            <i /> {post.category ?? "INSIGHTS"}
          </p>
          <h1>{post.title}</h1>
          <p className="article-meta">
            {when(post.publishedAt)} · {readingTime(post.content)} · {post.authorName}
          </p>
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
