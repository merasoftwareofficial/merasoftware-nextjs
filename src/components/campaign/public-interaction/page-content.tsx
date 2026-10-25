"use client";
import { useRef, type ReactNode } from "react";
import { useServerTime } from "@/components/use-server-time";
import Link from "@/components/link";
import { offerDiscountPercent, type Offer } from "@/lib/offers";
import s from "./variant.module.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

export function PublicInteraction({ offer, terms, preview = false, reservation }: { offer: Offer; terms: string[]; preview?: boolean; reservation?: ReactNode }) {
  const now = useServerTime();
  const dialog = useRef<HTMLDialogElement>(null);
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
          <a className={s.claim} href={href}>{expired ? "Ask about current offers" : offer.ctaLabel}<Arrow /></a>
          {reservation}
          <div className={s.cardFooter}><span>{channel}</span><button type="button" className={s.termsLink} onClick={() => dialog.current?.showModal()}>T&amp;C</button></div>
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
    {!preview && <div className={s.sticky}><div><span>{expired ? "OFFER ENDED" : offer.title}</span><strong>{expired ? "Check availability" : money(offer.offerPrice)}</strong></div><a href={href}>{expired ? "Contact us" : offer.ctaLabel}<Arrow /></a></div>}
  </main>;
}
