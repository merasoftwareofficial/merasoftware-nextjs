import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { SeoChecklist } from "@/components/seo-checks";
import { requireStaffPage } from "@/lib/auth";
import { SEO_AUDIT_GROUPS, seoAudit, type SeoAuditIssue } from "@/lib/seo-audit";

export const metadata = { title: "SEO health" };

const FILTERS = [
  { label: "All issues", value: "" },
  { label: "Errors", value: "error" },
  { label: "Warnings", value: "warning" },
] as const;

/**
 * One place to see every SEO issue on the live site, each with a link that
 * opens the admin page at the field to fix (lib/seo-audit.ts says what is
 * covered). Nothing is stored: fixing a field removes its issue on the next visit.
 *
 * Editors and admins only — the people who can fix what it lists.
 */
export default async function SeoHealth({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  await requireStaffPage("/admin/seo", "editor");
  const { level } = await searchParams;
  const filter = level === "error" || level === "warning" ? level : "";

  const rows = (await seoAudit())
    .map(row => ({ ...row, issues: filter ? row.issues.filter(issue => issue.level === filter) : row.issues }))
    .filter(row => row.issues.length > 0);
  const total = rows.reduce((sum, row) => sum + row.issues.length, 0);

  return (
    <main className="admin-main">
      <AdminHeader
        eyebrow="SEO"
        title="SEO health"
        description="Issues search engines can see on live and scheduled posts, homepage images and the Media Library. Fix → opens the place to change it."
      />

      <div className="admin-filters">
        {FILTERS.map(item => (
          <Link key={item.value} href={item.value ? `/admin/seo?level=${item.value}` : "/admin/seo"} className={filter === item.value ? "filter-chip on" : "filter-chip"}>
            {item.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="admin-empty">
          <b>{filter ? `No ${filter}s.` : "No SEO issues."}</b>
          <br />
          Everything checked passes.
        </div>
      ) : (
        <>
          <p className="field-hint">
            {total} issue{total === 1 ? "" : "s"} on {rows.length} item{rows.length === 1 ? "" : "s"}.
          </p>
          {SEO_AUDIT_GROUPS.map(group => {
            const groupRows = rows.filter(row => row.group === group);
            if (!groupRows.length) return null;
            return (
              <section className="seo-group" key={group}>
                <h2>
                  {group} <span>({groupRows.length})</span>
                </h2>
                <div className="review-queue">
                  {groupRows.map(row => (
                    <article className="review-item" key={row.key}>
                      <div className="review-head">
                        <div>
                          <p className="eyebrow">
                            <i /> {row.meta.toUpperCase()}
                          </p>
                          <h2>{row.title}</h2>
                        </div>
                        {row.viewHref ? (
                          <Link className="admin-action" href={row.viewHref} target="_blank">
                            View ↗
                          </Link>
                        ) : null}
                      </div>
                      <SeoChecklist checks={row.issues} fixHref={check => (check as SeoAuditIssue).href} />
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
