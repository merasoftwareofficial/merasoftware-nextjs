import type { Metadata } from "next";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StaffPackages } from "@/components/campaign/staff-packages";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import s from "@/components/campaign/campaign.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Business starter packages", description: "Compare one-time business website and profile setup packages.", robots: { index: false, follow: false } };
export default async function Page() {
  let catalogue;
  try { catalogue = await readSalesCatalogue(); } catch { /* No stale or fabricated prices during an outage. */ }
  return <><SiteHeader /><main className={s.page}><div className={s.wrap}><div style={{ paddingTop: 32, marginBottom: 24 }}><Link className="text-link" href="/">← Back to home</Link></div>{catalogue ? <StaffPackages items={catalogue.packages} categories={catalogue.categories} /> : <section className={s.section}><h1>Business starter packages</h1><p>Package details are temporarily unavailable. Please contact us for current scope and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about packages →</a></section>}</div></main><SiteFooter /></>;
}
