"use client";
import { useRef } from "react";
import type { QuotedPackage } from "@/lib/sales-packages";
import { offerDiscountPercent } from "@/lib/offers";
import Link from "@/components/link";
import s from "./campaign.module.css";
import d from "./public-interaction/variant.module.css";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
// The card shows this many inclusions; the rest are counted and listed on the package page.
export const CARD_INCLUSIONS = 5;

/**
 * A running offer on the card: the backend quote only carries a published offer that has not ended
 * (helpers/salesPackages.js offerEligible). Before the server clock is known the quote decides, so the
 * card never jumps between the two lists while the page loads; afterwards it ends on the countdown.
 */
export function packageOfferRunning(item: QuotedPackage, now: number | null) {
  const offer = item.quote.offer;
  return !!offer && (now === null || now < Date.parse(offer.endsAt));
}
function Countdown({ endsAt, now }: { endsAt: string; now: number | null }) {
  const seconds = now === null ? null : Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  const parts: [number | null, string][] = [
    [seconds === null ? null : Math.floor(seconds / 86400), "d"],
    [seconds === null ? null : Math.floor(seconds / 3600) % 24, "h"],
    [seconds === null ? null : Math.floor(seconds / 60) % 60, "m"],
    [seconds === null ? null : seconds % 60, "s"],
  ];
  return <div className={s.pkgTimer}><span>Offer ends in</span><span className={s.pkgClock} role="timer" aria-label="Time remaining">
    {parts.filter(([value, unit]) => unit !== "d" || value === null || value > 0).map(([value, unit]) => <span key={unit}>{value === null ? "—" : String(value).padStart(2, "0")}<em>{unit}</em></span>)}
  </span></div>;
}

/**
 * One package on a Pricing & Packages page (staff-packages.tsx). Every card has the same slots (name 2
 * lines, description 2 lines, price, first inclusions), so cards line up; the whole card opens
 * /package/<id>. A running offer gets the highlighted card with its countdown.
 */
export function PackageCard({ item, categoryLabel, now }: { item: QuotedPackage; categoryLabel: string; now: number | null }) {
  const terms = useRef<HTMLDialogElement>(null);
  const offer = packageOfferRunning(item, now) ? item.quote.offer : null;
  const discountedPrice = item.discountedPrice ?? item.regularPrice;
  const price = offer ? item.quote.finalPrice : discountedPrice;
  const percent = offer ? offerDiscountPercent({ mainPrice: item.regularPrice, offerPrice: price }) : 0;
  const more = item.inclusions.length - CARD_INCLUSIONS;
  const href = `/package/${encodeURIComponent(item.id)}`;
  return <article className={`${s.pkgCard}${offer ? ` ${s.pkgOffer}` : ""}`} data-package-card={item.id}>
    {offer && <div className={s.pkgBand}><span><small>Limited offer</small><b>{offer.title}</b></span>{percent > 0 && <span className={s.pkgPercent}>{percent}% OFF</span>}</div>}
    <p className={s.fine}>{categoryLabel} · One-time</p>
    {/* Every package has its own page, with its offer when one runs (app/package/[id]). */}
    <h3 className={s.pkgName}><Link href={href}>{item.name}</Link></h3>
    <p className={s.pkgDesc}>{item.description}</p>
    <div className={s.pkgPrice}>
      <div className={s.price}>{money(price)} <small>one-time</small></div>
      {offer
        ? <p className={s.pkgWas}><del>{money(item.regularPrice)}</del>{discountedPrice < item.regularPrice && <> · <del>{money(discountedPrice)}</del></>} · <b>Save {money(item.regularPrice - price)}</b></p>
        : discountedPrice < item.regularPrice && <p className={s.pkgWas}><del>{money(item.regularPrice)}</del> · <b>Save {money(item.regularPrice - discountedPrice)}</b></p>}
      {offer && <Countdown endsAt={offer.endsAt} now={now} />}
    </div>
    <h4 className={s.pkgIncluded}>What&apos;s included</h4>
    <ul className={s.list}>{item.inclusions.slice(0, CARD_INCLUSIONS).map((line, i) => <li key={i}>{line}</li>)}</ul>
    {more > 0 && <p className={s.pkgMore}>+ {more} more on the package page</p>}
    <div className={s.pkgFoot}>
      <button type="button" className={s.pkgTerms} onClick={() => terms.current?.showModal()}>Terms &amp; exclusions</button>
      <span className={s.button} aria-hidden="true">{offer ? "View offer →" : "View package →"}</span>
    </div>
    <dialog className={d.termsDialog} ref={terms} aria-labelledby={`terms-${item.id}`} onClick={event => { if (event.target === event.currentTarget) terms.current?.close(); }}>
      <div className={d.dialogContent}>
        <div className={d.dialogHeader}><h2 id={`terms-${item.id}`}>Terms &amp; exclusions</h2><button type="button" aria-label="Close terms and exclusions" onClick={() => terms.current?.close()}>×</button></div>
        <p>{item.name}</p>
        <ul>{(offer ? item.quote.terms : item.terms).map((line, i) => <li key={i}>{line}</li>)}</ul>
      </div>
    </dialog>
  </article>;
}
