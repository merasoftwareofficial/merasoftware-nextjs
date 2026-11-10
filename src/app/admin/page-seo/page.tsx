import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { allPageSeoPages } from "@/lib/page-seo";
import { settingsRepo } from "@/lib/repo";
import { organizationSeoChecks, pageSeoChecks, resolvePageSeo, seoIssues } from "@/lib/seo-rules";
import { OrganizationForm } from "./organization-form";
import { PageSeoForm } from "./page-seo-form";
import { PageSeoBrowser, type PageCardItem } from "./page-seo-browser";
import { PAGE_GROUPS, STATUS_LABEL, pageGroup, pageName, pageStatus, type PageGroup } from "./page-seo-groups";

export const metadata = { title: "Page SEO" };

/**
 * Search title, description and share image for the site's main pages and
 * package pages (lib/page-seo.ts lists them). Blog posts keep theirs in the blog form.
 *
 * Two views, both on this one page:
 * - `?group=<tab>` (default Main): the tab's pages as cards, with search.
 * - `?page=<key>`: one page's editor, with the Google preview beside the form.
 * `?page=organization` is the business details. "Fix →" on /admin/seo links here with `?page=`.
 */
export default async function PageSeoAdmin({ searchParams }: { searchParams: Promise<{ page?: string; group?: string }> }) {
  const user = await requireStaffPage("/admin/page-seo", "editor");
  const { page: key, group: groupParam } = await searchParams;
  const settings = await settingsRepo.get();
  const saved = settings.pageSeo ?? {};
  const pages = await allPageSeoPages();
  const organizationIssues = seoIssues(organizationSeoChecks(settings.organization)).length;
  const organizationHasText = Boolean(settings.organization?.logoUrl || settings.organization?.sameAs?.length);

  // Every page as one list item: its tab, short name, path and status.
  const items: PageCardItem[] = [
    ...pages.map(page => {
      // Custom text means a saved title or description; a share image alone does not count.
      const hasSaved = Boolean(saved[page.key]?.title?.trim() || saved[page.key]?.description?.trim());
      const issues = seoIssues(pageSeoChecks(resolvePageSeo(page, saved[page.key]))).length;
      return { key: page.key, name: pageName(page.label), path: page.path, group: pageGroup(page.key), status: pageStatus(issues, hasSaved) };
    }),
    { key: "organization", name: "Business details", path: "Logo and profile links", group: "Business", status: pageStatus(organizationIssues, organizationHasText) },
  ];

  const current = key ? items.find(item => item.key === key) : undefined;
  const currentPage = current && current.key !== "organization" ? pages.find(page => page.key === current.key) : undefined;
  const group: PageGroup = (PAGE_GROUPS as readonly string[]).includes(groupParam ?? "") ? (groupParam as PageGroup) : current ? (current.group as PageGroup) : "Main";
  const groupItems = items.filter(item => item.group === group);
  const counts = {
    total: items.length,
    custom: items.filter(item => item.status === "custom").length,
    todo: items.filter(item => item.status === "todo").length,
  };

  return (
    <main className="admin-main seo-page">
      <AdminHeader
        eyebrow="SEO"
        title="Page SEO"
        description="What Google and social previews show for each page. Leave a field empty to use the page's built-in text."
      />

      <div className="seo-summary-row" aria-label="Summary">
        <span className="stat-pill"><b>{counts.total}</b> pages</span>
        <span className="stat-pill"><b>{counts.custom}</b> with custom text</span>
        <span className="stat-pill attention"><b>{counts.todo}</b> need attention</span>
      </div>

      {current ? (
        <>
          <nav className="seo-crumb" aria-label="Breadcrumb">
            <Link href={`/admin/page-seo?group=${encodeURIComponent(group)}`}>Page SEO</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/admin/page-seo?group=${encodeURIComponent(group)}`}>{group}</Link>
            <span aria-hidden="true">/</span>
            <span>{current.name}</span>
          </nav>
          {current.key === "organization" ? (
            <OrganizationForm saved={settings.organization} role={user.role} />
          ) : currentPage ? (
            // Keyed by page, so switching pages starts a fresh form.
            <PageSeoForm key={currentPage.key} page={currentPage} name={current.name} saved={saved[currentPage.key]} role={user.role} />
          ) : null}
        </>
      ) : (
        <>
          <nav className="seo-tabs" aria-label="Page groups">
            {PAGE_GROUPS.map(name => (
              <Link key={name} href={`/admin/page-seo?group=${encodeURIComponent(name)}`} className={name === group ? "seo-tab on" : "seo-tab"} aria-current={name === group ? "page" : undefined}>
                {name}
              </Link>
            ))}
          </nav>
          <PageSeoBrowser key={group} items={groupItems} group={group} />
          <p className="seo-legend">
            {(["todo", "custom", "builtin"] as const).map(status => (
              <span key={status} className={`seo-status seo-status-${status}`}>{STATUS_LABEL[status]}</span>
            ))}
          </p>
        </>
      )}
    </main>
  );
}
