import Link from "@/components/link";
import { PageHero } from "@/components/page-hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioCard } from "@/components/portfolio";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { publicPortfolio } from "@/lib/portfolio/types";
export const dynamic = "force-dynamic";
export const metadata = { title: "Our Work", description: "Explore websites, apps and software built by Mera Software." };
export default async function Work({ searchParams }: { searchParams: Promise<{ category?: string; type?: string; page?: string }> }) {
  const params = await searchParams;
  const entries = (await portfolioRepo.list(true)).map(publicPortfolio);
  const categories = [...new Set(entries.map(row => row.category))].sort();
  const filtered = entries.filter(row => (!params.category || row.category === params.category) && (!params.type || row.type === params.type));
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const requested = Number(params.page);
  const page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
  const href = (target: number) => `/work?${new URLSearchParams({ ...(params.category ? { category: params.category } : {}), ...(params.type ? { type: params.type } : {}), page: String(target) })}`;
  return <><SiteHeader /><main><PageHero eyebrow="SELECTED WORK" title="Built around real business needs." text="Explore our websites, applications and ongoing service work." /><section className="content-section section-soft"><div className="container">
    <form className="portfolio-filters" action="/work"><label>Category<select name="category" defaultValue={params.category ?? ""}><option value="">All categories</option>{categories.map(category => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label>Work type<select name="type" defaultValue={params.type ?? ""}><option value="">All work</option><option value="project">Projects</option><option value="service">Services</option></select></label><button className="button" type="submit">Filter</button></form>
    {filtered.length ? <div className="portfolio-grid">{filtered.slice((page - 1) * 12, page * 12).map(entry => <PortfolioCard key={entry._id} entry={entry} />)}</div> : <p className="portfolio-empty">Our project showcase is being prepared. <Link href="/contact">Talk to us about your project ↗</Link></p>}
    {pages > 1 ? <nav className="portfolio-pagination" aria-label="Portfolio pages">{page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : null}<span>Page {page} of {pages}</span>{page < pages ? <Link href={href(page + 1)}>Next →</Link> : null}</nav> : null}</div></section></main><SiteFooter /></>;
}
