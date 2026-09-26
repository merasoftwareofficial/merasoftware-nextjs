import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { isReadable } from "@/lib/blog-rules";
import { blogRepo, userRepo } from "@/lib/repo";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params) {
  const { username } = await params;
  const member = await userRepo.findByUsername(username);
  if (!member) return { title: "Member" };

  return {
    title: `${member.displayName} — member`,
    description: member.bio || `Posts by ${member.displayName} on the Mera Software community.`,
  };
}

function when(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A member's public profile and the work of theirs that is live.
 *
 * Only published posts the viewer may read are listed — isReadable keeps
 * drafts, pending submissions and rejected posts private, and shows the author
 * or a moderator more than it shows a visitor.
 */
export default async function MemberProfile({ params }: Params) {
  const { username } = await params;
  const viewer = await getSessionUser();
  const member = await userRepo.findByUsername(username);

  if (!member || member.banned) notFound();

  const posts = (await blogRepo.list({ authorId: member._id, status: "published" })).filter(
    post => post.visibility !== "unlisted" && isReadable(post, viewer),
  );

  const own = viewer?._id === member._id;

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow={member.role === "member" ? "COMMUNITY MEMBER" : member.role.toUpperCase()}
          title={member.displayName}
          text={member.bio || `Member of the Mera Software community since ${when(member.createdAt)}.`}
        />
        <section className="content-section container">
          <div className="section-top">
            <p className="eyebrow">
              <i /> {posts.length === 1 ? "1 PUBLISHED POST" : `${posts.length} PUBLISHED POSTS`}
            </p>
            {own ? (
              <Link className="button button-dark" href="/community/write">
                Write a post <span>→</span>
              </Link>
            ) : null}
          </div>

          {posts.length === 0 ? (
            <div className="admin-empty" style={{ marginTop: 40 }}>
              <b>Nothing published yet.</b>
              <br />
              {own ? "Your approved posts will be listed here." : `${member.displayName} has no published posts yet.`}
            </div>
          ) : (
            <div className="post-grid" style={{ marginTop: 32 }}>
              {posts.map(post => (
                <Link className="post-card" href={`/blog/${post.slug}`} key={post._id}>
                  {post.featuredImage?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="post-art post-art-image" src={post.featuredImage.url} alt={post.featuredImage.alt} />
                  ) : (
                    <div className="post-art">
                      {(post.category ?? "MERA SOFTWARE").toUpperCase()}
                      <br />
                      <br />
                      {post.type === "official" ? "INSIGHTS" : "COMMUNITY"}
                    </div>
                  )}
                  <div className="post-copy">
                    <span>{post.category ?? "Community"}</span>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                    <div className="post-meta">
                      <span>{when(post.publishedAt)}</span>
                      <span>{post.type === "discussion" ? "Discussion" : "Article"}</span>
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
