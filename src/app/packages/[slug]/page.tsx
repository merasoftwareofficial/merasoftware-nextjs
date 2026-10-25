import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StaffPackages } from "@/components/campaign/staff-packages";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import { readPackagePages } from "@/lib/package-pages-server";
import { pageMetadata } from "@/lib/page-seo";
import s from "@/components/campaign/campaign.module.css";
export const dynamic = "force-dynamic";

// A "Pricing & Packages" menu page (lib/package-pages.ts): the published packages that list it.
// A deleted page is a 404.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return (await readPackagePages()).some(page => page.slug === slug) ? pageMetadata(`packages-${slug}`) : { title: "Packages" };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = (await readPackagePages()).find(entry => entry.slug === slug);
  if (!page) notFound();
  let catalogue;
  try { catalogue = await readSalesCatalogue(); } catch { /* No stale or fabricated prices during an outage. */ }
  return <><SiteHeader /><main className={s.page}><div className={s.wrap}><div style={{ paddingTop: 32, marginBottom: 24 }}><Link className="text-link" href="/">← Back to home</Link></div>{catalogue ? <StaffPackages title={page.title} intro={page.intro} items={catalogue.packages.filter(item => item.pages?.includes(page.slug))} categories={catalogue.categories} /> : <section className={s.section}><h1>{page.title}</h1><p>Package details are temporarily unavailable. Please contact us for current scope and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about packages →</a></section>}</div></main><SiteFooter /></>;
}
