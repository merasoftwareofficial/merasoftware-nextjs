import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { atLeast, requireStaffPage } from "@/lib/auth";
import { blogRepo, commentRepo, reportRepo } from "@/lib/repo";
import { seoAudit } from "@/lib/seo-audit";
import s from "./overview.module.css";

export const metadata = { title: "Website overview" };

export default async function Admin() {
  const user = await requireStaffPage("/admin");
  const canEdit = atLeast(user.role, "editor");
  const [published, pendingPosts, pendingComments, openReports, mine, seoRows] = await Promise.all([
    blogRepo.count({ status: "published" }),
    blogRepo.count({ status: "pending" }),
    commentRepo.list("pending").then(rows => rows.length),
    reportRepo.list(false).then(rows => rows.length),
    blogRepo.count({ authorId: user._id }),
    canEdit ? seoAudit() : [],
  ]);
  const seoIssues = seoRows.reduce((sum, row) => sum + row.issues.length, 0);
  const attention = [
    { title: "Post submissions", count: pendingPosts, description: "Submitted posts awaiting a publication decision.", href: "/admin/blog/review", action: "Review submissions" },
    { title: "Pending comments", count: pendingComments, description: "Comments awaiting approval before appearing on blog posts.", href: "/admin/comments?status=pending", action: "Review comments" },
    { title: "Open reports", count: openReports, description: "Unresolved reader reports on posts and comments.", href: "/admin/comments#reports", action: "Review reports" },
    ...(canEdit ? [{ title: "SEO issues", count: seoIssues, description: `Detected errors and warnings across ${seoRows.length} affected item${seoRows.length === 1 ? "" : "s"}.`, href: "/admin/seo", action: "Review SEO issues" }] : []),
  ];
  const pending = attention.filter(item => item.count > 0);
  const shortcuts = [
    ...(canEdit ? [
      { title: "Website Content", description: "Edit text, buttons and section visuals on Home, About and Services.", href: "/admin/content" },
      { title: "Portfolio", description: "Edit project details and images, and select projects to feature on the homepage.", href: "/admin/portfolio" },
      { title: "Media Library", description: "Upload images and edit the descriptions used when selecting media.", href: "/admin/media" },
    ] : []),
    { title: "Blog Management", description: "Write articles, manage existing posts and review reader submissions and comments.", href: "/admin/blog-management" },
    ...(atLeast(user.role, "admin") ? [{ title: "Communication", description: "Configure message rules and templates, review emails before sending and track sending history. Portal and WhatsApp controls require portal admin access.", href: "/admin/communication" }] : []),
    ...(canEdit ? [{ title: "Page SEO", description: "Edit search titles, descriptions and sharing details for website pages.", href: "/admin/page-seo" }] : []),
  ];

  return <main className={`admin-main ${s.overview}`}>
    <AdminHeader eyebrow="CONTROL PANEL" title="Website Overview"
      description={canEdit ? "Review pending submissions, update website content and resolve detected SEO issues." : "Review submitted posts, moderate comments and resolve reader reports."}
      action={<div className={s.actions}>
        <Link className="admin-button" href={canEdit ? "/admin/content" : "/admin/blog/new"}>{canEdit ? "Edit website content" : "Write an article"}</Link>
        <Link className="admin-button secondary" href="/" target="_blank" rel="noreferrer">View website ↗</Link>
      </div>} />

    <section className={s.section} aria-labelledby="overview-attention">
      <h2 id="overview-attention">Needs attention</h2>
      {pending.length ? <div className={s.attention}>
        {pending.map(item => <Link className={s.pending} href={item.href} key={item.title}>
          <strong className={s.count}>{item.count.toLocaleString("en-IN")}</strong>
          <span className={s.detail}><strong>{item.title}</strong><span>{item.description}</span></span>
          <span className={s.destination}>{item.action} <span aria-hidden="true">→</span></span>
        </Link>)}
      </div> : <p className={s.empty}>No post submissions, comments or reader reports are awaiting review.{canEdit ? " No issues found by the current SEO checks." : ""}</p>}
    </section>

    <section className={s.section} aria-labelledby="overview-access">
      <h2 id="overview-access">Quick access</h2>
      <div className={s.shortcuts}>{shortcuts.map(item => <Link className={s.shortcut} href={item.href} key={item.title}>
        <span className={s.detail}><strong>{item.title}</strong><span>{item.description}</span></span>
        <span className={s.arrow} aria-hidden="true">→</span>
      </Link>)}</div>
    </section>

    <section className={s.section} aria-labelledby="overview-summary">
      <h2 id="overview-summary">Content summary</h2>
      <div className={s.summary}>
        <Link href="/admin/blog?status=published"><strong>{published.toLocaleString("en-IN")}</strong><span>Published posts<span className={s.summaryNote}>Posts with published status across all authors.</span></span><span className={s.arrow} aria-hidden="true">→</span></Link>
        <div><strong>{mine.toLocaleString("en-IN")}</strong><span>Your posts<span className={s.summaryNote}>Posts authored by you, across all statuses.</span></span></div>
      </div>
    </section>
  </main>;
}
