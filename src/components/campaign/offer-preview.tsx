import type { Offer } from "@/lib/offers";
import s from "./offer-preview.module.css";
export function OfferPreview({ offer }: { offer: Offer }) {
  const expired = Date.now() >= Date.parse(offer.endsAt);
  return <div className={s.preview} aria-hidden="true">
    <div className={s.pitch}><span>{offer.eyebrow}</span><strong>{offer.heading}<em>{offer.headingHighlight}</em></strong><p>{offer.description}</p><ul>{offer.inclusions.slice(0, 3).map((item, i) => <li key={i}>{item}</li>)}</ul></div>
    <div className={s.priceCard}><span>{offer.tagline}</span><strong>{offer.title}</strong>{expired ? <p className={s.ended}>Offer ended</p> : <><div className={s.old}><del>₹{offer.mainPrice.toLocaleString("en-IN")}</del><span>→</span><del>₹{offer.discountPrice.toLocaleString("en-IN")}</del></div><small>OFFER PRICE</small><b>₹{offer.offerPrice.toLocaleString("en-IN")}</b><p>{offer.priceDescription}</p></>}<div className={s.cta}>{expired ? "Check availability" : offer.ctaLabel} →</div></div>
  </div>;
}
