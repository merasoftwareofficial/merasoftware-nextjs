import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OffersGrid } from "@/components/campaign/offers-grid";
import { readOffersPage } from "@/lib/offers-page-server";
import { pageMetadata } from "@/lib/page-seo";
import s from "@/components/campaign/campaign.module.css";

// The offers page: every package offer, running first, then expired (lib/offers-page.ts). /offer opens
// here too (app/offer/page.tsx). An offer's own page stays at /offer/<slug> (app/offer/[slug]).
export const dynamic = "force-dynamic";
export function generateMetadata() { return pageMetadata("offers"); }
export default async function Page() {
  const { listing, catalogue, cards } = await readOffersPage();
  return <><SiteHeader /><main className={s.page}><div className={s.wrap}>{catalogue
    ? <OffersGrid title={listing.title} emptyMessage={listing.emptyMessage} cards={cards} categories={catalogue.categories} />
    : <section className={s.section}><h1>{listing.title}</h1><p>Offer details are temporarily unavailable. Please contact us for current offers and pricing.</p><a href="mailto:contact@merasoftware.com">Enquire about offers →</a></section>}</div></main><SiteFooter /></>;
}
