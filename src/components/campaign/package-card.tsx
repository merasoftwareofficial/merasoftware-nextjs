"use client";
import { billingLabel, priceUnit, type QuotedPackage } from "@/lib/sales-packages";
import { offerDiscountPercent } from "@/lib/offers";
import { formatIndiaDate } from "@/lib/date-time";
import type { EndedOffer } from "@/lib/offers-page";
import Link from "@/components/link";
import { PackageTermsButton } from "@/components/packages/package-terms-button";
import s from "./campaign.module.css";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const pad = (value: number) => String(value).padStart(2, "0");
// The card shows this many inclusions, one line each; the rest are counted and listed on the package page.
export const CARD_INCLUSIONS = 5;

/**
 * A running offer on the card: the backend quote only carries a published offer that has not ended
 * (helpers/salesPackages.js offerEligible). Before the server clock is known the quote decides, so the
 * card never jumps while the page loads; afterwards it ends on the countdown.
 */
export function packageOfferRunning(item: QuotedPackage, now: number | null) {
  const offer = item.quote.offer;
  return !!offer && (now === null || now < Date.parse(offer.endsAt));
}
/** "2d 23h 58m 59s" until `endsAt`, "—" while the server clock is not known yet. */
export function timeLeft(endsAt: string, now: number | null) {
  if (now === null) return "—";
  const seconds = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ""}${pad(Math.floor(seconds / 3600) % 24)}h ${pad(Math.floor(seconds / 60) % 60)}m ${pad(seconds % 60)}s`;
}

/**
 * One package on a Pricing & Packages page (staff-packages.tsx). Every card has the same slots (name 2
 * lines, description 2 lines, price, inclusions one line each), so a row lines up; the whole card opens
 * /package/<id>. A running offer gets the highlighted card with its countdown. On the /offers page
 * (offers-grid.tsx) a package whose offer has ended gets `ended`: the expired card, normal price.
 */
export function PackageCard({ item, categoryLabel, now, ended }: { item: QuotedPackage; categoryLabel: string; now: number | null; ended?: EndedOffer | null }) {
  const offer = packageOfferRunning(item, now) ? item.quote.offer : null;
  const expired = offer ? null : ended ?? null;
  const discountedPrice = item.discountedPrice ?? item.regularPrice;
  const price = offer ? item.quote.finalPrice : discountedPrice;
  const percent = offer ? offerDiscountPercent({ mainPrice: item.regularPrice, offerPrice: price }) : 0;
  const more = item.inclusions.length - CARD_INCLUSIONS;
  const href = `/package/${encodeURIComponent(item.id)}`;
  return <article className={`${s.pkgCard}${offer ? ` ${s.pkgOffer}` : expired ? ` ${s.pkgEnded}` : ""}`} data-package-card={item.id} data-offer-state={offer ? "running" : expired ? "expired" : undefined}>
    {offer && <div className={s.pkgBand}><b><small>Limited offer</small>{offer.title}</b>{percent > 0 && <span className={s.pkgPercent}>{percent}% OFF</span>}</div>}
    {expired && <div className={s.pkgBand}><b><small>Offer ended</small>{expired.title}</b><span className={s.pkgPercent}>Expired</span></div>}
    <p className={s.pkgCategory}>{categoryLabel} · {billingLabel(item)}</p>
    {/* Every package has its own page, with its offer when one runs (app/package/[id]). */}
    <h3 className={s.pkgName}><Link href={href}>{item.name}</Link></h3>
    <p className={s.pkgDesc}>{item.description}</p>
    <div className={s.pkgPrice}>
      <div className={s.pkgAmount}>{money(price)} <small>{priceUnit(item)}</small></div>
      {offer
        ? <p className={s.pkgWas}><del>{money(item.regularPrice)}</del>{discountedPrice < item.regularPrice && <> · <del>{money(discountedPrice)}</del></>} · <b>Save {money(item.regularPrice - price)}</b></p>
        : discountedPrice < item.regularPrice && <p className={s.pkgWas}><del>{money(item.regularPrice)}</del> · <b>Save {money(item.regularPrice - discountedPrice)}</b></p>}
      {expired && <p className={s.pkgTimer}>Offer price <del>{money(expired.offerPrice)}</del> · ended {formatIndiaDate(expired.endsAt)}</p>}
      {offer && <p className={s.pkgTimer}>Offer ends in <b role="timer" aria-label="Time remaining">{timeLeft(offer.endsAt, now)}</b></p>}
    </div>
    <h4 className={s.pkgIncluded}>What&apos;s included</h4>
    <ul className={s.pkgList}>{item.inclusions.slice(0, CARD_INCLUSIONS).map((line, i) => <li key={i} title={line}>{line}</li>)}</ul>
    {more > 0 && <p className={s.pkgMore}>+ {more} more on the package page</p>}
    <div className={s.pkgFoot}>
      <PackageTermsButton className={s.pkgTerms} name={item.name} lines={offer ? item.quote.terms : item.terms} />
      <span className={s.pkgButton} aria-hidden="true">{offer ? "View offer →" : "View package →"}</span>
    </div>
  </article>;
}
