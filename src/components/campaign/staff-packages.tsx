"use client";
import { useState } from "react";
import { useServerTime } from "@/components/use-server-time";
import { type QuotedPackage } from "@/lib/sales-packages";
import { PackageCard, packageOfferRunning, timeLeft } from "./package-card";
import s from "./campaign.module.css";

/**
 * One package page (lib/package-pages.ts): its own heading and introduction above its packages.
 * One grid: packages with a running offer first, then the rest in the admin's order, so an offer never
 * leaves a half-empty row. While an offer runs, "All packages" / "Offers running" switch the list;
 * without one the grid starts straight away. When an offer ends its card returns to its own place.
 */
export function StaffPackages({ title, intro, items }: { title: string; intro: string; items: QuotedPackage[] }) {
  const now = useServerTime();
  const [onlyOffers, setOnlyOffers] = useState(false);
  const offers = items.filter(item => packageOfferRunning(item, now));
  const showOffers = onlyOffers && offers.length > 0;
  const shown = showOffers ? offers : [...offers, ...items.filter(item => !offers.includes(item))];
  // The offer that ends first, for the countdown on the tab.
  const soonest = offers.map(item => item.quote.offer!.endsAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return <div className={s.staff}>
    {/* Compact heading, so the first row of packages shows without scrolling. The count is on the
        All packages switch, and offers are on this page, so no count pill or offers button here. */}
    <header className={s.pkgHero}><p className={s.kicker}>PRICING &amp; PACKAGES</p><h1>{title}</h1>{intro && <p>{intro}</p>}</header>
    {!items.length && <p>No packages are available right now. Contact us for a quotation.</p>}
    {offers.length > 0 && <div className={s.pkgTabs} role="group" aria-label="Show packages">
      <button type="button" className={s.pkgTab} aria-pressed={!showOffers} onClick={() => setOnlyOffers(false)}>All packages <span className={s.pkgCount}>{items.length}</span></button>
      <button type="button" className={`${s.pkgTab} ${s.pkgTabOffer}`} aria-pressed={showOffers} onClick={() => setOnlyOffers(true)}><i aria-hidden="true" />Offers running <span className={s.pkgCount}>{offers.length}</span><span className={s.pkgEnds}>· ends in {timeLeft(soonest, now)}</span></button>
    </div>}
    <div className={s.pkgGrid}>{shown.map(item => <PackageCard key={item.id} item={item} now={now} />)}</div>
  </div>;
}
