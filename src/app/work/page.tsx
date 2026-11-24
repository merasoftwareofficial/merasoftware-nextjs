import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioCard } from "@/components/portfolio";
import { PortfolioFilters } from "@/components/portfolio-filters";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { publicPortfolio } from "@/lib/portfolio/types";
import c from "@/components/campaign/campaign.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Our Work", description: "Explore websites, apps and software built by Mera Software." };
export default async function Work({ searchParams }: { searchParams: Promise<{ category?: string; type?: string; page?: string }> }) {
  const params = await searchParams;
  const entries = (await portfolioRepo.list(true)).map(publicPortfolio);
  const categoryCounts = new Map<string, number>();
  for (const row of entries) {
    if (row.category) categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
  }
  const categories = [...categoryCounts.keys()].sort().map(category => ({
    value: category,
    label: category.replaceAll("_", " "),
    count: categoryCounts.get(category) ?? 0,
  }));
  const filtered = entries.filter(row => (!params.category || row.category === params.category) && (!params.type || row.type === params.type));
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const requested = Number(params.page);
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  const href = (target: number) => `/work?${new URLSearchParams({ ...(params.category ? { category: params.category } : {}), ...(params.type ? { type: params.type } : {}), page: String(target) })}`;
  return (
    <>
      <SiteHeader />
      <main className={c.page}>
        <div className={c.wrap}>
          <div className={c.staff}>
            <header className={c.pkgHero}>
              <p className={c.kicker}>SELECTED WORK</p>
              <h1>Digital work for real business needs.</h1>
              <p>See the websites, apps, software and service work we create for our clients.</p>
            </header>
            {entries.length > 0 && (
              <PortfolioFilters
                totalCount={entries.length}
                categories={categories}
                selectedCategory={params.category ?? ""}
                selectedType={params.type ?? ""}
              />
            )}
            {filtered.length ? (
              <div className="portfolio-grid">
                {filtered.slice((page - 1) * 12, page * 12).map(entry => <PortfolioCard key={entry._id} entry={entry} />)}
              </div>
            ) : (
              <p className="portfolio-empty">Our project showcase is being prepared. <Link href="/contact">Talk to us about your project ↗</Link></p>
            )}
            {pages > 1 ? (
              <nav className="portfolio-pagination" aria-label="Portfolio pages">
                {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : null}
                <span>Page {page} of {pages}</span>
                {page < pages ? <Link href={href(page + 1)}>Next →</Link> : null}
              </nav>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
