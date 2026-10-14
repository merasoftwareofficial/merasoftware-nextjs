/* eslint @next/next/no-img-element: off -- existing brand and published project images. */
"use client";
import { useEffect, useState } from "react";
import { BRAND_LOGO } from "@/lib/brand";
import { variantContent as content } from "./content";
import s from "./variant.module.css";

const email = "contact@merasoftware.com";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const sample = { title: "Business Growth Starter", regularPrice: 10000, offerPrice: 4000, contactPrice: 699 };

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;
}
function enquiryHref(preview: boolean, expired = false) {
  const text = expired ? "Hello, please share your current business growth services and pricing." : preview ? "Hello, I saw the sample starter offer on your design preview. Please confirm the actual service, inclusions, price and validity for my business." : `Hello, I am interested in ${content.offer?.title}. Please confirm the included services and offer eligibility for my business.`;
  return content.whatsapp ? `https://wa.me/${content.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` : `mailto:${email}?subject=${encodeURIComponent("Business growth starter enquiry")}&body=${encodeURIComponent(text)}`;
}
export function PublicInteraction() {
  const [selectedWork, setSelectedWork] = useState(1);
  const [now, setNow] = useState<number | null>(null);
  const realOffer = content.offer;
  const preview = !realOffer;
  const offer = realOffer ?? sample;
  const end = realOffer ? Date.parse(realOffer.endsAt) : null;
  useEffect(() => {
    if (end === null || !Number.isFinite(end)) return;
    const update = () => setNow(Date.now());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [end]);
  const expired = !preview && end !== null && (!Number.isFinite(end) || (now !== null && now >= end));
  const loading = !preview && !expired && now === null;
  // A labelled, fixed visual sample for the owner's example. Only a confirmed offer uses a live deadline.
  const seconds = preview ? 1799 : end !== null && now !== null ? Math.max(0, Math.floor((end - now) / 1000)) : 0;
  const clock = [[Math.floor(seconds / 3600), "HOURS"], [Math.floor(seconds / 60) % 60, "MINUTES"], [seconds % 60, "SECONDS"]];
  const work = content.work[selectedWork] ?? content.work[0];
  const cta = expired ? "Ask about current offers" : "Enquire about this offer";
  const href = enquiryHref(preview, expired);
  return <main className={s.page}>
    <header className={s.header}><img src={BRAND_LOGO.dark} width={BRAND_LOGO.width} height={BRAND_LOGO.height} alt={BRAND_LOGO.alt}/><a href="#work">Our work <Arrow/></a></header>
    <div className={s.shell}>
      <section className={s.hero}>
        <div className={s.pitch}><span className={s.local}><i/>AMRITSAR BUSINESS OWNERS</span><h1>Get your business<br/><em>noticed online.</em></h1><p>Websites. Google visibility. Social media.<br/>One team to help you take the next step.</p><div className={s.promise}><span>Understand your business</span><b>→</b><span>Recommend the right plan</span></div><a className={s.proofLink} href="#work"><span className={s.proofIcon}>↗</span><span><strong>See the work behind the promise.</strong><small>College websites · business websites · software</small></span><Arrow/></a><div className={s.clientNames}><span>WORK BUILT FOR</span><strong>3G-Digital</strong><span className={s.divider}/><strong>Shri Lakshami Narayan<br/>Ayurvedic College</strong></div></div>
        <section className={s.offer} aria-label="Starter offer" id="offer">
          <div className={s.offerTop}><span>YOUR FIRST STEP ONLINE</span><span className={s.offerBadge}>{preview ? "DESIGN PREVIEW" : "STARTER OFFER"}</span></div>
          <h2>{offer.title}</h2>
          {expired ? <div className={s.expired}><h3>This offer has ended.</h3><p>Talk to us about the services and offers currently available.</p></div> : loading ? <p className={s.loading}>Checking offer availability…</p> : <>
            <div className={s.oldPrices} aria-label="Price comparison"><div><span>Regular price</span><del>{money(offer.regularPrice)}</del></div><b>→</b><div><span>Discounted price</span><del>{money(offer.offerPrice)}</del></div></div>
            <div className={s.deal}><div><span className={s.dealLabel}>{preview ? "EXAMPLE CONTACT OFFER" : "CONTACT OFFER"}</span><strong><small>₹</small>{offer.contactPrice.toLocaleString("en-IN")}</strong></div><span className={s.dealSide}>A smaller step.<br/><b>A new beginning.</b></span></div>
            <div className={s.countdown}><div><span className={s.clockDot}/><strong>{preview ? "Countdown preview" : "Offer ends in"}</strong></div><div className={s.timer} aria-label={preview ? "Sample countdown: 29 minutes 59 seconds" : "Offer time remaining"}>{clock.map(([value, label]) => <div key={label}><b>{String(value).padStart(2, "0")}</b><span>{label}</span></div>)}</div></div>
          </>}
          <a className={s.claim} href={href}>{cta}<Arrow/></a>
          <p className={s.channel}>{content.whatsapp ? "Opens WhatsApp · speak directly with our team" : "Opens email · speak directly with our team"}</p>
          {preview ? <p className={s.previewNote}>Sample prices and timer for design review. Service scope and offer validity are not yet confirmed.</p> : <details className={s.offerDetails}><summary>What’s included & offer terms</summary><ul>{realOffer.inclusions.map(item => <li key={item}>{item}</li>)}</ul><p>{realOffer.demoDescription}</p><p>{realOffer.terms}</p></details>}
        </section>
      </section>
      <section className={s.workSection} id="work"><div className={s.workHeading}><div><span className={s.eyebrow}>REAL WORK. REAL BUSINESSES.</span><h2>Take a look before we talk.</h2></div><div className={s.projectSwitch} role="group" aria-label="Choose a project">{content.work.map((item, index) => <button key={item.url} aria-pressed={selectedWork === index} onClick={() => setSelectedWork(index)}>{index === 0 ? "College website" : index === 1 ? "Business website" : "ERP software"}</button>)}</div></div>{work && <article className={s.project} key={work.url}><a className={s.projectImage} href={work.liveUrl ?? work.url} target="_blank" rel="noreferrer"><img src={work.image} alt={work.imageAlt} loading="lazy"/></a><div className={s.projectInfo}><span>{work.category}</span><h3>{work.brand}</h3><p>{work.description}</p><div><a href={work.url} target="_blank" rel="noreferrer">View project <Arrow/></a>{work.liveUrl && <a href={work.liveUrl} target="_blank" rel="noreferrer">Live website ↗</a>}</div></div></article>}</section>
      {(content.testimonials.length > 0 || content.reviewsUrl) && <section className={s.reviews}><h2>From our clients</h2>{content.testimonials.slice(0, 2).map(t => <figure key={t.name}><blockquote>“{t.quote}”</blockquote><figcaption>{t.name} · {t.business}</figcaption></figure>)}{content.reviewsUrl && <a href={content.reviewsUrl} target="_blank" rel="noreferrer">Read our Google reviews ↗</a>}</section>}
      <section className={s.bottomLine}><div><h2>Your business comes first.</h2><p>Tell us what you need. We’ll explain the service, scope and cost.</p></div><a href={href}>Let’s talk <Arrow/></a></section>
      <footer className={s.footer}><div><a href={`mailto:${email}`}>{email}</a>{content.phone && <a href={`tel:${content.phone.replace(/[^+\d]/g, "")}`}>{content.phone}</a>}{content.address && <address>{content.address}</address>}{content.mapsUrl && <a href={content.mapsUrl} target="_blank" rel="noreferrer">Google Maps ↗</a>}</div><a href="/privacy">Privacy policy</a></footer>
    </div>
    <div className={s.sticky}><div><span>{preview ? "SAMPLE STARTER OFFER" : expired ? "LET’S TALK" : "STARTER OFFER"}</span><strong>{expired ? "Find your next step" : money(offer.contactPrice)}{!expired && <small> · {preview ? "design preview" : "contact offer"}</small>}</strong></div><a href={href}>{expired ? "Contact us" : "Enquire now"}<Arrow/></a>{content.phone && <a className={s.phone} href={`tel:${content.phone.replace(/[^+\d]/g, "")}`}>Call</a>}</div>
  </main>;
}
