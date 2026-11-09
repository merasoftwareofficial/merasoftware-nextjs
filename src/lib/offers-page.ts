import type { Offer } from "@/lib/offers";
import type { QuotedPackage } from "@/lib/sales-packages";

/**
 * The /offers page (app/offers/page.tsx): one card per published package that has an offer.
 * - A running offer (the backend quote carries it, helpers/salesPackages.js offerEligible) shows its
 *   live card with the countdown.
 * - Otherwise the package's latest ended offer shows as an expired card. It stays until the admin
 *   archives (deletes) that offer or starts a new one on the package (owner decision 9 Nov 2026);
 *   nothing ends it automatically. Same "latest ended" rule as the admin package form (packages-manager.tsx).
 * Running cards come first, then expired cards, latest end first.
 */
export type EndedOffer = { slug: string; title: string; offerPrice: number; endsAt: string };
export type OfferCard = { item: QuotedPackage; ended: EndedOffer | null };

export function offerCards(packages: QuotedPackage[], offers: Offer[], now: number): OfferCard[] {
  const running: OfferCard[] = [];
  const ended: OfferCard[] = [];
  for (const item of packages) {
    if (item.quote.offer) { running.push({ item, ended: null }); continue; }
    const last = offers
      .filter(offer => offer.status === "published" && offer.packageId === item.id && Date.parse(offer.endsAt) <= now)
      .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
    if (last) ended.push({ item, ended: { slug: last.slug, title: last.title, offerPrice: last.offerPrice, endsAt: last.endsAt } });
  }
  return [...running, ...sortEnded(ended)];
}

/** Expired cards: the latest end first. */
export const sortEnded = <T extends { ended: EndedOffer | null }>(cards: T[]) =>
  [...cards].sort((a, b) => Date.parse(b.ended!.endsAt) - Date.parse(a.ended!.endsAt));

/** A running card whose countdown reaches zero while the page is open becomes its expired card. */
export function endedFromQuote(item: QuotedPackage): EndedOffer | null {
  const offer = item.quote.offer;
  return offer ? { slug: offer.slug, title: offer.title, offerPrice: item.quote.finalPrice, endsAt: offer.endsAt } : null;
}
