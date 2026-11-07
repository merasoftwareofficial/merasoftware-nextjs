"use client";
import { useEffect, useRef } from "react";
import { useServerTime } from "@/components/use-server-time";
import Link from "@/components/link";
import { offerDiscountPercent } from "@/lib/offers";
import type { OfferView } from "@/lib/package-design";
import { useOfferReservation, usePackageStart, type ReservationConfig } from "@/components/offer-reservations";
import type { PhoneCountry } from "@/components/phone-field";
import { PhoneField } from "@/components/phone-field";
import type { OfferReservation } from "@/lib/offer-reservations";
import { heldPrice, reservationHoldHours, reserveCta, type ReservationPhase, type ReserveCta } from "@/lib/offer-reservation-rules";
import s from "./variant.module.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

// Admin preview of the reservation states, without any request (admin/offers/offers-manager.tsx).
export type ReservationPreview = "normal" | "open" | "reserved";
function previewState(state: ReservationPreview, now: number, holdHours: number): { phase: ReservationPhase; cta: ReserveCta } {
  const phase: ReservationPhase = state === "open" ? "open" : state === "reserved" ? "reserved" : "none";
  const due = new Date(now + (holdHours * 60 - 40) * 60000).toISOString();
  const row: OfferReservation | null = state === "reserved" ? { id: "preview", offerSlug: "preview", title: "", reservedPrice: 0, regularPrice: 0, terms: [], reservedAt: due, expiresAt: due, deadline: due, extendedUntil: null, status: "reserved", projectId: null, confirmationStatus: "sent" } : null;
  return { phase, cta: reserveCta(phase, row, now, holdHours) };
}

/**
 * A package's own page (app/package/[id], src/docs/package-offers.md). `live`: a running offer is shown;
 * without one (or once it ends) the card shows the main price crossed out and the normal price, without a
 * countdown, and its main button is Start my project (`start`, while that feature is on).
 */
export type PackageMode = { id: string; name: string; live: boolean; back: { href: string; label: string }; packageTerms: string[];
  start?: { signedIn: boolean; countries?: PhoneCountry[] } };

/**
 * The offer page, and the package page. The card has one main button that follows the customer's state
 * (lib/offer-reservation-rules.ts reserveCta): Enquire, Reserve, Start my project or the reservation
 * status, the same in the sticky bar. Each is confirmed in a dialog, so the card never changes its size.
 */
export function PublicInteraction({ offer, terms, preview = false, reservation, previewReservation, pkg }: { offer: OfferView; terms: string[]; preview?: boolean; reservation?: ReservationConfig; previewReservation?: ReservationPreview; pkg?: PackageMode }) {
  const now = useServerTime();
  const dialog = useRef<HTMLDialogElement>(null);
  const reserveDialog = useRef<HTMLDialogElement>(null);
  const startDialog = useRef<HTMLDialogElement>(null);
  const control = useOfferReservation(preview ? undefined : reservation, offer);
  const packageStart = usePackageStart(preview || !pkg?.start ? undefined : { packageId: pkg.id, ...pkg.start });
  const holdHours = reservationHoldHours(offer);
  const shown = preview ? previewState(previewReservation ?? "normal", now ?? Date.parse(offer.endsAt), holdHours) : control;
  const end = Date.parse(offer.endsAt);
  const validEnd = Number.isFinite(end);
  const expired = !validEnd || (now !== null && now >= end);
  // A package page without a running offer, or whose offer has just ended: 2 prices, no countdown.
  const packageMode = !!pkg && (!pkg.live || expired);
  const ready = now !== null;
  const seconds = ready && validEnd ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
  const clock: [number, string][] = [
    [Math.floor(seconds / 86400), "DAYS"],
    [Math.floor(seconds / 3600) % 24, "HOURS"],
    [Math.floor(seconds / 60) % 60, "MINS"],
    [seconds % 60, "SECS"],
  ];
  const message = expired
    ? `Hello, please share your current ${offer.title} pricing and availability.`
    : `Hello, I am interested in ${offer.title}. Please confirm the price, included services and availability for my business.`;
  const href = offer.contactHref.startsWith("mailto:") ? (() => {
    const url = new URL(offer.contactHref);
    url.searchParams.set("subject", offer.title + " enquiry");
    url.searchParams.set("body", message);
    return url.toString();
  })() : offer.contactHref;
  // Package offers show the saving against the main price; older offers keep their card unchanged.
  const percent = offer.packageId ? offerDiscountPercent(offer) : 0;
  const channel = offer.contactHref.startsWith("mailto:") ? "Opens email" : offer.contactHref.startsWith("tel:") ? "Opens phone" : "Contact us";
  // A saved reservation stays visible after the offer ends; Reserve itself never outlives the offer.
  const offerCta: ReserveCta = expired && (shown.cta.kind === "reserve" || shown.phase === "expired") ? { kind: "enquire" } : shown.cta;
  // On a package without an offer, a running reservation of its last offer keeps its own button; otherwise
  // the main button is Start my project (helpers/packageStart.js), or Enquire while that is switched off.
  const keepsReservation = offerCta.kind === "start" || offerCta.kind === "status";
  const packageCta = !packageMode || keepsReservation || (!pkg?.start && !preview) ? null
    : packageStart.request ? { label: "Start requested · our team will contact you", sent: true } : { label: "Start my project", sent: false };
  const cta: ReserveCta = packageMode && !keepsReservation ? { kind: "enquire" } : offerCta;
  const { error, phase } = control;
  const title = packageMode && pkg ? pkg.name : offer.title;
  const shownTerms = packageMode && pkg ? pkg.packageTerms : terms;
  // The card keeps the offer's current price; the reservation's own saved price shows with its timer
  // (sticky bar, Start dialog), also after the admin changed the offer or it ended.
  const held = heldPrice(phase, control.row);
  // A refusal (e.g. after returning from sign-in) opens the dialog to explain it; success closes it.
  useEffect(() => { if (error && reserveDialog.current && !reserveDialog.current.open) reserveDialog.current.showModal(); }, [error]);
  useEffect(() => { if (phase !== "open" && phase !== "checking" && !error) reserveDialog.current?.close(); }, [phase, error]);
  useEffect(() => { if (packageStart.error && startDialog.current && !startDialog.current.open) startDialog.current.showModal(); }, [packageStart.error]);
  useEffect(() => { if (packageStart.request && !packageStart.error) startDialog.current?.close(); }, [packageStart.request, packageStart.error]);
  // Reserve and Start my project are confirmed in the same dialog; its words follow the button.
  const starting = control.cta.kind === "start";
  const action = (className: string | undefined, enquireLabel: string) => packageCta
    ? <button type="button" className={className} disabled={packageCta.sent || (!packageStart.loaded && !preview)} onClick={() => { if (!preview) startDialog.current?.showModal(); }}>{packageCta.label}{!packageCta.sent && <Arrow />}</button>
    : cta.kind === "reserve" || cta.kind === "start"
    ? <button type="button" className={className} disabled={cta.kind === "reserve" && cta.disabled} onClick={() => { if (!preview) reserveDialog.current?.showModal(); }}>{cta.label}<Arrow /></button>
    : cta.kind === "status" ? <Link className={className} href="/account/offers">{cta.label}<Arrow /></Link>
    : <a className={className} href={href}>{enquireLabel}<Arrow /></a>;

  return <main className={`${s.page}${preview ? ` ${s.previewPage}` : ""}`} >
    <div className={s.shell}>
      <Link className={s.back} href={pkg?.back.href ?? "/offer"}>← {pkg?.back.label ?? "All offers"}</Link>
      <section className={s.hero}>
        <div className={s.pitch}>
          <span className={s.local}><i /> {offer.eyebrow}</span>
          <h1>{offer.heading}{offer.headingHighlight && <><br /><em>{offer.headingHighlight}</em></>}</h1>
          <p>{offer.description}{offer.supportingLine && <><br />{offer.supportingLine}</>}</p>
          <h2 className={s.benefitsHeading}>{offer.subheading}</h2>
          <ul className={s.benefits}>{offer.inclusions.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <section className={s.offer} aria-label={title}>
          <div className={s.offerTop}><span>{offer.tagline}</span><span className={s.offerBadge}>{offer.badge}</span></div>
          <h2>{title}</h2>
          {packageMode ? <>
            {offer.mainPrice > offer.discountPrice && <div className={s.oldPrices} aria-label="Price comparison">
              <div><span>Main price</span><del>{money(offer.mainPrice)}</del></div>
            </div>}
            <div className={s.deal}><span className={s.dealLabel}>PRICE</span><strong><small>₹</small>{offer.discountPrice.toLocaleString("en-IN")}</strong></div>
            <p className={s.priceDescription}>{offer.priceDescription}</p>
          </> : expired ? <div className={s.expired}><h3>This offer has ended.</h3><p>Ask us about current pricing and availability.</p></div> : <>
            <div className={s.oldPrices} aria-label="Price comparison">
              <div><span>Main price</span><del>{money(offer.mainPrice)}</del></div>
              <b aria-hidden="true">→</b>
              <div><span>Normal discount price</span><del>{money(offer.discountPrice)}</del></div>
            </div>
            <div className={s.deal}><span className={s.dealLabel}>OFFER PRICE{percent > 0 && <b className={s.dealPercent}>{percent}% OFF</b>}</span><strong><small>₹</small>{offer.offerPrice.toLocaleString("en-IN")}</strong></div>
            <p className={s.priceDescription}>{offer.priceDescription}</p>
            <div className={s.countdown}>
              <div className={s.timerLabel}><span className={s.clockDot} /><strong>Offer ends in</strong></div>
              <div className={s.timer} role="timer" aria-label="Time remaining">{clock.map(([value, label]) => <div key={label}><b>{ready ? String(value).padStart(2, "0") : "—"}</b><span>{label}</span></div>)}</div>
            </div>
          </>}
          {action(s.claim, expired && !packageMode ? "Ask about current offers" : offer.ctaLabel)}
          <div className={s.cardFooter}>{cta.kind === "enquire" && !packageCta ? <span>{channel}</span> : <a className={s.footerLink} href={href}>Have a question? Enquire</a>}<button type="button" className={s.termsLink} onClick={() => dialog.current?.showModal()}>T&amp;C</button></div>
        </section>
      </section>
    </div>
    <dialog className={s.termsDialog} ref={dialog} aria-labelledby="offer-terms-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="offer-terms-title">Terms &amp; conditions</h2><button type="button" aria-label="Close terms and conditions" onClick={() => dialog.current?.close()}>×</button></div>
        <p>{title}</p>
        <ul>{shownTerms.map(term => <li key={term}>{term}</li>)}</ul>
      </div>
    </dialog>
    {reservation && !preview && <dialog className={s.termsDialog} ref={reserveDialog} aria-labelledby="reserve-title" onClick={event => { if (event.target === event.currentTarget) reserveDialog.current?.close(); }}>
      {starting ? <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="reserve-title">Start your project on this offer?</h2><button type="button" aria-label="Close" onClick={() => reserveDialog.current?.close()}>×</button></div>
        <p>{offer.title} · {money(held ?? offer.offerPrice)}</p>
        <ul>
          <li>Our team will contact you to set up your project.</li>
          <li>Your reservation is paused, so this offer does not expire while we prepare it.</li>
        </ul>
        {control.error && <p role="alert" className={s.reserveError}>{control.error}</p>}
        <button type="button" className={s.claim} disabled={control.busy} onClick={control.start}>{control.busy ? "Sending…" : "Confirm"}<Arrow /></button>
      </div> : <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="reserve-title">Reserve this price for {holdHours} hours</h2><button type="button" aria-label="Close reservation" onClick={() => reserveDialog.current?.close()}>×</button></div>
        <p>{offer.title} · {money(offer.offerPrice)}</p>
        <ul>
          <li>Your price is held for {holdHours} hours from the moment you reserve.</li>
          <li>No payment now. Get your project started before your reservation ends, or this offer expires for you.</li>
          {!control.signedIn && <li>Reserving needs an account. Sign in, or create one in a minute; you come back here and the reservation is saved.</li>}
        </ul>
        {control.error && <p role="alert" className={s.reserveError}>{control.error}</p>}
        {control.needsPhone && <PhoneField className="auth-field" countries={control.countries} value={control.phone} onChange={control.setPhone} />}
        {!control.loaded && control.error
          ? <button type="button" className={s.claim} onClick={control.retry}>Try again<Arrow /></button>
          : <button type="button" className={s.claim} disabled={control.busy || control.cta.kind !== "reserve" || control.cta.disabled || (control.needsPhone && !control.phone.phone.trim())} onClick={control.confirm}>{control.busy ? "Reserving…" : control.signedIn ? "Confirm reservation" : "Continue to sign in"}<Arrow /></button>}
      </div>}
    </dialog>}
    {pkg?.start && !preview && <dialog className={s.termsDialog} ref={startDialog} aria-labelledby="start-title" onClick={event => { if (event.target === event.currentTarget) startDialog.current?.close(); }}>
      <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="start-title">Start your project on this package?</h2><button type="button" aria-label="Close" onClick={() => startDialog.current?.close()}>×</button></div>
        <p>{pkg.name} · {money(offer.discountPrice)}</p>
        <ul>
          <li>Our team will contact you to set up your project.</li>
          <li>No payment now. The price and scope are confirmed with you before work starts.</li>
          {!packageStart.signedIn && <li>Starting needs an account. Sign in, or create one in a minute; you come back here and your request is sent.</li>}
        </ul>
        {packageStart.error && <p role="alert" className={s.reserveError}>{packageStart.error}</p>}
        {packageStart.needsPhone && <PhoneField className="auth-field" countries={packageStart.countries} value={packageStart.phone} onChange={packageStart.setPhone} />}
        <button type="button" className={s.claim} disabled={packageStart.busy || !!packageStart.request || (packageStart.needsPhone && !packageStart.phone.phone.trim())} onClick={packageStart.confirm}>{packageStart.busy ? "Sending…" : packageStart.signedIn ? "Confirm" : "Continue to sign in"}<Arrow /></button>
      </div>
    </dialog>}
    {!preview && <div className={s.sticky}><div>{held !== null ? <><span>Your reserved price</span><strong>{money(held)}</strong></> : packageMode ? <><span>{title}</span><strong>{money(offer.discountPrice)}</strong></> : <><span>{expired ? "OFFER ENDED" : offer.title}</span><strong>{expired ? "Check availability" : money(offer.offerPrice)}</strong></>}</div>{action(undefined, expired && !packageMode ? "Contact us" : offer.ctaLabel)}</div>}
  </main>;
}
