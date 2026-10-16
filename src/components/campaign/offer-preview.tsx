"use client";
import { useServerTime } from "@/components/use-server-time";
import type { Offer } from "@/lib/offers";
import s from "./offer-preview.module.css";
export function OfferPreview({ offer }: { offer: Offer }) {
  const now = useServerTime();
  const expired = !Number.isFinite(Date.parse(offer.endsAt)) || (now !== null && now >= Date.parse(offer.endsAt));
  return <div className={s.preview} aria-hidden="true">
    <div className={s.pitch}><span>{offer.eyebrow}</span><strong>{offer.heading}<em>{offer.headingHighlight}</em></strong><p>{offer.description}</p><ul>{offer.inclusions.slice(0, 3).map((item, i) => <li key={i}>{item}</li>)}</ul></div>
    <div className={s.priceCard}><span>{offer.tagline}</span><strong>{offer.title}</strong>{now === null ? <p>Checking availability</p> : expired ? <p className={s.ended}>Offer ended</p> : <><div className={s.old}><del>₹{offer.mainPrice.toLocaleString("en-IN")}</del><span>→</span><del>₹{offer.discountPrice.toLocaleString("en-IN")}</del></div><small>OFFER PRICE</small><b>₹{offer.offerPrice.toLocaleString("en-IN")}</b><p>{offer.priceDescription}</p></>}<div className={s.cta}>{now === null || expired ? "Check availability" : offer.ctaLabel} →</div></div>
  </div>;
}
export function OfferBadge({ offer }: { offer: Offer }) {
  const now = useServerTime();
  return <>{now === null ? "Checking availability" : !Number.isFinite(Date.parse(offer.endsAt)) || now >= Date.parse(offer.endsAt) ? "Offer ended" : offer.badge}</>;
}
