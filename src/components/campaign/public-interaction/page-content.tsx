"use client";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { starterOffer as offer, resolveOfferTerms } from "./offer-content";
import s from "./variant.module.css";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

export function PublicInteraction() {
  const [now, setNow] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const end = Date.parse(offer.endsAt);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
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
    ? "Hello, please share your current Business Growth Starter pricing and availability."
    : `Hello, I am interested in ${offer.title}. Please confirm the price, included services and availability for my business.`;
  const href = `mailto:contact@merasoftware.com?subject=${encodeURIComponent(offer.title + " enquiry")}&body=${encodeURIComponent(message)}`;

  return <main className={s.page}>
    <div className={s.shell}>
      <Link className={s.back} href="/offer">← All offers</Link>
      <section className={s.hero}>
        <div className={s.pitch}>
          <span className={s.local}><i /> YOUR BUSINESS, ONLINE</span>
          <h1>Get your business<br /><em>noticed online.</em></h1>
          <p>{offer.description}<br />One team to help you take the next step.</p>
          <h2 className={s.benefitsHeading}>{offer.subheading}</h2>
          <ul className={s.benefits}>{offer.inclusions.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
        <section className={s.offer} aria-label={offer.title}>
          <div className={s.offerTop}><span>{offer.tagline}</span><span className={s.offerBadge}>STARTER OFFER</span></div>
          <h2>{offer.title}</h2>
          {expired ? <div className={s.expired}><h3>This offer has ended.</h3><p>Ask us about current pricing and availability.</p></div> : <>
            <div className={s.oldPrices} aria-label="Price comparison">
              <div><span>Main price</span><del>{money(offer.mainPrice)}</del></div>
              <b aria-hidden="true">→</b>
              <div><span>Normal discount price</span><del>{money(offer.discountPrice)}</del></div>
            </div>
            <div className={s.deal}><span className={s.dealLabel}>OFFER PRICE</span><strong><small>₹</small>{offer.offerPrice.toLocaleString("en-IN")}</strong></div>
            <p className={s.priceDescription}>{offer.priceDescription}</p>
            <div className={s.countdown}>
              <div className={s.timerLabel}><span className={s.clockDot} /><strong>Offer ends in</strong></div>
              <div className={s.timer} role="timer" aria-label="Time remaining">{clock.map(([value, label]) => <div key={label}><b>{ready ? String(value).padStart(2, "0") : "—"}</b><span>{label}</span></div>)}</div>
            </div>
          </>}
          <a className={s.claim} href={href}>{expired ? "Ask about current offers" : "Enquire about this offer"}<Arrow /></a>
          <div className={s.cardFooter}><span>Opens email</span><button type="button" className={s.termsLink} onClick={() => dialog.current?.showModal()}>T&amp;C</button></div>
        </section>
      </section>
    </div>
    <dialog className={s.termsDialog} ref={dialog} aria-labelledby="offer-terms-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={s.dialogContent}>
        <div className={s.dialogHeader}><h2 id="offer-terms-title">Terms &amp; conditions</h2><button type="button" aria-label="Close terms and conditions" onClick={() => dialog.current?.close()}>×</button></div>
        <p>{offer.title}</p>
        <ul>{resolveOfferTerms(offer.terms).map(term => <li key={term}>{term}</li>)}</ul>
      </div>
    </dialog>
    <div className={s.sticky}><div><span>{expired ? "OFFER ENDED" : offer.title}</span><strong>{expired ? "Check availability" : money(offer.offerPrice)}</strong></div><a href={href}>{expired ? "Contact us" : "Enquire now"}<Arrow /></a></div>
  </main>;
}
