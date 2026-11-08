"use client";
import { useEffect, useRef } from "react";
import { useServerTime } from "@/components/use-server-time";
import { categoryLabel, type ProjectCategory, type QuotedPackage } from "@/lib/sales-packages";
import { PackageCard, packageOfferRunning } from "./package-card";
import Link from "@/components/link";
import s from "./campaign.module.css";
// Cards sit side by side above this width (campaign.module.css: one column at 540px and below).
const SIDE_BY_SIDE = "(min-width: 541px)";

/**
 * Gives every package card on the page the height of the tallest one. CSS already makes the rows of
 * one list equal (grid-auto-rows); this also lines up the offer list with the other packages. In one
 * column each card keeps its own height.
 */
function useOneCardHeight(root: React.RefObject<HTMLDivElement | null>, layoutKey: string) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const equalize = () => {
      const cards = [...element.querySelectorAll<HTMLElement>("[data-package-card]")];
      cards.forEach(card => { card.style.minHeight = ""; });
      if (!window.matchMedia(SIDE_BY_SIDE).matches) return;
      const tallest = Math.max(0, ...cards.map(card => card.getBoundingClientRect().height));
      cards.forEach(card => { card.style.minHeight = `${Math.ceil(tallest)}px`; });
    };
    equalize();
    // Only a width change can change the text wrapping; the heights set here must not re-trigger it.
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => { if (element.clientWidth !== width) { width = element.clientWidth; equalize(); } });
    observer.observe(element);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) equalize(); });
    return () => { active = false; observer.disconnect(); };
  }, [root, layoutKey]);
}

/**
 * One package page (lib/package-pages.ts): its own heading and introduction above its packages.
 * Packages with a running offer come first under "Offers running now"; when an offer ends its card
 * moves back to "All packages" in the admin's order.
 */
export function StaffPackages({ title, intro, items, categories }: { title: string; intro: string; items: QuotedPackage[]; categories?: ProjectCategory[] }) {
  const now = useServerTime();
  const lists = useRef<HTMLDivElement>(null);
  const offers = items.filter(item => packageOfferRunning(item, now));
  const others = items.filter(item => !offers.includes(item));
  useOneCardHeight(lists, offers.map(item => item.id).join());
  const card = (item: QuotedPackage) => <PackageCard key={item.id} item={item} categoryLabel={categoryLabel(categories, item.category)} now={now} />;
  return <div className={s.staff}>
    <section className={s.showcaseHero}><p className={s.kicker}>PRICING &amp; PACKAGES</p><h1>{title}</h1><p>{intro}</p><div className={s.pills}><span>{items.length} packages</span></div><div className={s.actions}><Link className={s.button} href="/offer">Explore offers →</Link></div></section>
    {!items.length && <p>No packages are available right now. Contact us for a quotation.</p>}
    <div ref={lists}>
      {offers.length > 0 && <section className={s.pkgGroup} aria-labelledby="packages-offers">
        <div className={s.pkgGroupHead}><h2 id="packages-offers">Offers running now</h2><span className={s.pkgLive}><i />Limited time</span></div>
        <div className={s.pkgGrid}>{offers.map(card)}</div>
      </section>}
      {others.length > 0 && <section className={s.pkgGroup} aria-labelledby="packages-all">
        <div className={s.pkgGroupHead}><h2 id="packages-all">All packages</h2><span className={s.fine}>{others.length} packages</span></div>
        <div className={s.pkgGrid}>{others.map(card)}</div>
      </section>}
    </div>
  </div>;
}
