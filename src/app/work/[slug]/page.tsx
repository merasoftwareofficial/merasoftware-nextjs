import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PortfolioStory } from "@/components/portfolio";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { isPublicPortfolio, publicPortfolio } from "@/lib/portfolio/types";
import { SITE_URL } from "@/lib/structured-data";
export const dynamic = "force-dynamic";
const load = cache(async (slug: string) => { const row = await portfolioRepo.findBySlug(slug); return row && isPublicPortfolio(row) ? publicPortfolio(row) : null; });
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const row = await load((await params).slug);
  if (!row) return { title: "Project not found", robots: { index: false } };
  return { title: row.title, description: row.summary, alternates: { canonical: `${SITE_URL}/work/${row.slug}` }, openGraph: { title: row.title, description: row.summary, images: row.cover ? [{ url: row.cover.url, alt: row.cover.alt }] : [] } };
}
export default async function Project({ params }: { params: Promise<{ slug: string }> }) {
  const row = await load((await params).slug); if (!row) notFound();
  return <><SiteHeader /><main><PortfolioStory entry={row} /></main><SiteFooter /></>;
}
