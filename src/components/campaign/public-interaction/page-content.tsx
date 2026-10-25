"use client";
import { useEffect, useRef } from "react";
import { useServerTime } from "@/components/use-server-time";
import Link from "@/components/link";
import { offerDiscountPercent, type Offer } from "@/lib/offers";
import { useOfferReservation, type ReservationConfig } from "@/components/offer-reservations";
import { PhoneField } from "@/components/phone-field";
import type { OfferReservation } from "@/lib/offer-reservations";
import { reserveCta, RESERVE_HOLD_HOURS, type ReservationPhase, type ReserveCta } from "@/lib/offer-reservation-rules";
import s from "./variant.module.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

// Admin preview of the reservation states, without any request (admin/offers/offers-manager.tsx).
export type ReservationPreview = "normal" | "open" | "reserved";
function previewState(state: ReservationPreview, now: number): { phase: ReservationPhase; cta: ReserveCta } {
  const phase: ReservationPhase = state === "open" ? "open" : state === "reserved" ? "reserved" : "none";
  const due = new Date(now + (RESERVE_HOLD_HOURS * 60 - 40) * 60000).toISOString();
  const row: OfferReservation | null = state === "reserved" ? { id: "preview", offerSlug: "preview", title: "", reservedPrice: 0, regularPrice: 0, terms: [], reservedAt: due, expiresAt: due, deadline: due, extendedUntil: null, status: "reserved", projectId: null, confirmationStatus: "sent" } : null;
  return { phase, cta: reserveCta(phase, row, now) };
}

/**
 * The offer page. The card has one main button that follows the customer's reservation state
 * (lib/offer-reservation-rules.ts reserveCta): Enquire, Reserve, or the reservation status, the same
 * in the sticky bar. Reserve is confirmed in a dialog, so the card never changes its size.
 */
export function PublicInteraction({ offer, terms, preview = false, reservation, previewReservation }: { offer: Offer; terms: string[]; preview?: boolean; reservation?: ReservationConfig; previewReservation?: ReservationPreview }) {
  const now = useServerTime();
  const dialog = useRef<HTMLDialogElement>(null);
  const reserveDialog = useRef<HTMLDialogElement>(null);
  const control = useOfferReservation(preview ? undefined : reservation, offer);
  const shown = preview ? previewState(previewReservation ?? "normal", now ?? Date.parse(offer.endsAt)) : control;
  const end = Date.parse(offer.endsAt);
  const validEnd = Number.isFinite(end);
  const expired = !validEnd || (now !== null && now >= end);
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
  const cta: ReserveCta = expired && (shown.cta.kind === "reserve" || shown.phase === "expired") ? { kind: "enquire" } : shown.cta;
  const { error, phase } = control;
  // A refusal (e.g. after returning from sign-in) opens the dialog to explain it; success closes it.
  useEffect(() => { if (error && reserveDialog.current && !reserveDialog.current.open) reserveDialog.current.showModal(); }, [error]);
  useEffect(() => { if (phase !== "open" && phase !== "checking" && !error) reserveDialog.current?.close(); }, [phase, error]);
  const action = (className: string | undefined, enquireLabel: string) => cta.kind === "reserve"
    ? <button type="button" className={className} disabled={cta.disabled} onClick={() => { if (!preview) reserveDialog.current?.showModal(); }}>{cta.label}<Arrow /></button>
    : cta.kind === "status" ? <Link className={className} href="/account/offers">{cta.label}<Arrow /></Link>
    : <a className={className} href={href}>{enquireLabel}<Arrow /></a>;

  return <main className={`${s.page}${preview ? ` ${s.previewPage}` : ""}`} >
    <div className={s.shell}>
      <Link className={s.back} href="/offer">← All offers</Link>
      <section className={s.hero}>
        <div className={s.pitch}>
          <span className={s.local}><i /> {offer.eyebrow}</span>
          <h1>{offer.heading}{offer.headingHighlight && <><br /><em>{offer.headingHighlight}</em></>}</h1>
          <p>{offer.description}{offer.supportingLine && <><br />{offer.supportingLine}</>}</p>
          <h2 className={s.benefitsHeading}>{offer.subheading}</h2>
          <ul className={s.benefits}>{offer.inclusions.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <section className={s.offer} aria-label={offer.title}>
          <div className={s.offerTop}><span>{offer.tagline}</span><span className={s.offerBadge}>{offer.badge}</span></div>
          <h2>{offer.title}</h2>
          {expired ? <div className={s.expired}><h3>This offer has ended.</h3><p>Ask us about current pricing and availability.</p></div> : <>
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
          {action(s.claim, expired ? "Ask about current offers" : offer.ctaLabel)}
          <div className={s.cardFooter}>{cta.kind === "enquire" ? <span>{channel}</span> : <a className={s.footerLink} href={href}>Have a question? Enquire</a>}<button type="button" className={s.termsLink} onClick={() => dialog.current?.showModal()}>T&amp;C</button></div>
        </section>
      </section>
    </div>
    <dialog className={s.termsDialog} ref={dialog} aria-labelledby="offer-terms-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="offer-terms-title">Terms &amp; conditions</h2><button type="button" aria-label="Close terms and conditions" onClick={() => dialog.current?.close()}>×</button></div>
        <p>{offer.title}</p>
        <ul>{terms.map(term => <li key={term}>{term}</li>)}</ul>
      </div>
    </dialog>
    {reservation && !preview && <dialog className={s.termsDialog} ref={reserveDialog} aria-labelledby="reserve-title" onClick={event => { if (event.target === event.currentTarget) reserveDialog.current?.close(); }}>
      <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="reserve-title">Reserve this price for {RESERVE_HOLD_HOURS} hours</h2><button type="button" aria-label="Close reservation" onClick={() => reserveDialog.current?.close()}>×</button></div>
        <p>{offer.title} · {money(offer.offerPrice)}</p>
        <ul>
          <li>Your price is held for {RESERVE_HOLD_HOURS} hours from the moment you reserve.</li>
          <li>No payment now. Pay the first bill before your reservation deadline to keep this price.</li>
          {!control.signedIn && <li>Reserving needs an account. Sign in, or create one in a minute; you come back here and the reservation is saved.</li>}
        </ul>
        {control.error && <p role="alert" className={s.reserveError}>{control.error}</p>}
        {control.needsPhone && <PhoneField className="auth-field" countries={control.countries} value={control.phone} onChange={control.setPhone} />}
        {!control.loaded && control.error
          ? <button type="button" className={s.claim} onClick={control.retry}>Try again<Arrow /></button>
          : <button type="button" className={s.claim} disabled={control.busy || control.cta.kind !== "reserve" || control.cta.disabled || (control.needsPhone && !control.phone.phone.trim())} onClick={control.confirm}>{control.busy ? "Reserving…" : control.signedIn ? "Confirm reservation" : "Continue to sign in"}<Arrow /></button>}
      </div>
    </dialog>}
    {!preview && <div className={s.sticky}><div><span>{expired ? "OFFER ENDED" : offer.title}</span><strong>{expired ? "Check availability" : money(offer.offerPrice)}</strong></div>{action(undefined, expired ? "Contact us" : offer.ctaLabel)}</div>}
  </main>;
}
