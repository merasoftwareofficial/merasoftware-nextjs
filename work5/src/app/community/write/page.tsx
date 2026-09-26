import Link from "next/link";
import { redirect } from "next/navigation";
import { CommunityForm } from "@/components/community-form";
import { PageHero } from "@/components/page-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/blog-rules";
import { blogRepo } from "@/lib/repo";

export const metadata = { title: "Write for the Community" };

/**
 * Members write here. `?type=discussion` opens the form as a discussion,
 * `?edit=<slug>` reopens the author's own draft or a rejected post.
 */
export default async function Write({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; edit?: string }>;
}) {
  const { type, edit } = await searchParams;
  const user = await getSessionUser();

  const next = `/community/write${type ? `?type=${type}` : ""}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const kind = type === "discussion" ? "discussion" : "community";

  // Reopening an existing post: it must exist, be the member's own community
  // work, and still be editable — canEdit blocks a published post.
  const existing = edit ? await blogRepo.findBySlug(edit) : null;
  if (edit && (!existing || existing.type === "official" || !canEdit(user, existing))) {
    return (
      <>
        <SiteHeader />
        <main>
          <PageHero
            eyebrow="COMMUNITY CONTRIBUTION"
            title="This post cannot be edited."
            text="It may already be published, or it belongs to another member."
          />
          <section className="content-section container">
            <div className="admin-empty">
              <Link className="text-link" href="/admin/blog">
                Back to my posts <span>→</span>
              </Link>
            </div>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="COMMUNITY CONTRIBUTION"
          title={existing ? "Update your post." : "Share something useful."}
          text="Write practical, original content for business owners and digital professionals. Every post is reviewed before publication."
        />
        <section className="content-section container">
          <CommunityForm blog={existing ?? undefined} type={kind} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
