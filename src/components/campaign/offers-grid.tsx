"use client";
import { useServerTime } from "@/components/use-server-time";
import { endedFromQuote, sortEnded, type OfferCard } from "@/lib/offers-page";
import { PackageCard, packageOfferRunning } from "./package-card";
import s from "./campaign.module.css";

/**
 * The /offers page (app/offers/page.tsx): running offers first with their countdown, then expired offers
 * (lib/offers-page.ts). A countdown that reaches zero turns its card into the expired card at once.
 */
export function OffersGrid({ title, emptyMessage, cards }: { title: string; emptyMessage: string; cards: OfferCard[] }) {
  const now = useServerTime();
  const live = cards.map(card => ({ item: card.item, ended: packageOfferRunning(card.item, now) ? null : card.ended ?? endedFromQuote(card.item) }));
  const shown = [...live.filter(card => !card.ended), ...sortEnded(live.filter(card => card.ended))];
  return <div className={s.staff}>
    <header className={s.pkgHero}><p className={s.kicker}>OFFERS</p><h1>{title}</h1></header>
    {!shown.length && <p>{emptyMessage}</p>}
    <div className={s.pkgGrid}>{shown.map(({ item, ended }) => <PackageCard key={item.id} item={item} ended={ended} now={now} />)}</div>
  </div>;
}
