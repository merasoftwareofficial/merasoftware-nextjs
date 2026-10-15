/* eslint @next/next/no-img-element: off -- local offer screenshots retain their original preview dimensions. */
import type { Metadata } from "next";
import Link from "@/components/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers, DEFAULT_OFFER_LISTING } from "@/lib/offers";
import { OfferPreview } from "@/components/campaign/offer-preview";
import s from "./offers.module.css";

export const metadata: Metadata = {
  title: "Business promotion offers",
  description: "Browse our business promotion offers.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export default async function OffersPage() {
  const settings = await settingsRepo.get();
  const offers = publishedOffers(settings.offers);
  const listing = settings.offerListing ?? DEFAULT_OFFER_LISTING;
  return <>
    <SiteHeader />
    <main className={s.page}>
      <div className="container">
        <Link className={s.back} href="/">← Home</Link>
        <h1>{listing.title}</h1>
        {!offers.length && <p>{listing.emptyMessage}</p>}
        <div className={s.grid}>
          {offers.map(offer => <Link className={s.card} href={`/offer/${offer.slug}`} key={offer.slug}>
            <OfferPreview offer={offer} />
            <div className={s.content}>
              <span className={s.label}>{Date.now() >= Date.parse(offer.endsAt) ? "Offer ended" : offer.badge}</span>
              <h2>{offer.title}</h2>
              <p>{offer.description}</p>
              <span className={s.action}>View offer <span aria-hidden="true">→</span></span>
            </div>
          </Link>)}
        </div>
      </div>
    </main>
    <SiteFooter />
  </>;
}
