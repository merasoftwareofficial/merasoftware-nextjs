import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SEO_PAGES } from "@/lib/page-seo";
import { settingsRepo } from "@/lib/repo";
import { organizationSeoChecks, pageSeoChecks, resolvePageSeo, seoIssues } from "@/lib/seo-rules";
import { OrganizationForm } from "./organization-form";
import { PageSeoForm } from "./page-seo-form";

export const metadata = { title: "Page SEO" };

/**
 * Search title, description and share image for the site's fixed pages
 * (lib/page-seo.ts lists them). Blog posts keep theirs in the blog form.
 * `?page=<key>` opens one page (`?page=organization` the business details);
 * "Fix →" on /admin/seo links here that way.
 */
export default async function PageSeoAdmin({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireStaffPage("/admin/page-seo", "editor");
  const { page: key } = await searchParams;
  const settings = await settingsRepo.get();
  const saved = settings.pageSeo ?? {};
  const showOrganization = key === "organization";
  const current = PAGE_SEO_PAGES.find(page => page.key === key) ?? PAGE_SEO_PAGES[0];
  const organizationIssues = seoIssues(organizationSeoChecks(settings.organization)).length;

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="SEO"
        title="Page SEO"
        description="What Google and social previews show for the site's main pages. Leave a field empty to use the page's built-in text."
      />

      <div className="admin-filters">
        {PAGE_SEO_PAGES.map(page => {
          const issues = seoIssues(pageSeoChecks(resolvePageSeo(page, saved[page.key]))).length;
          return (
            <Link key={page.key} href={`/admin/page-seo?page=${page.key}`} className={!showOrganization && page.key === current.key ? "filter-chip on" : "filter-chip"}>
              {page.label}
              {issues ? ` · ${issues} !` : " ✓"}
            </Link>
          );
        })}
        <Link href="/admin/page-seo?page=organization" className={showOrganization ? "filter-chip on" : "filter-chip"}>
          Business details{organizationIssues ? ` · ${organizationIssues} !` : " ✓"}
        </Link>
      </div>

      {showOrganization ? (
        <OrganizationForm saved={settings.organization} role={user.role} />
      ) : (
        // Keyed by page, so switching pages starts a fresh form.
        <PageSeoForm key={current.key} page={current} saved={saved[current.key]} role={user.role} />
      )}
    </main>
  );
}
