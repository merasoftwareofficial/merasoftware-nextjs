import type { QuotedPackage } from "@/lib/sales-packages";
import { formatIndiaDateTime } from "@/lib/date-time";
import s from "./campaign.module.css";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export function PackageCard({ item, categoryLabel, now }: { item: QuotedPackage; categoryLabel: string; now: number | null }) {
  const offer = item.quote.offer;
  const active = now !== null && !!offer && now < Date.parse(offer.endsAt);
  const amount = active ? item.quote.finalPrice : item.regularPrice;
  const href = `mailto:contact@merasoftware.com?subject=${encodeURIComponent(`${item.name} package enquiry`)}&body=${encodeURIComponent(`Hello, I am interested in ${item.name} (${item.id}). Please confirm included work, pricing and terms.`)}`;
  return <article className={s.card}><p className={s.fine}>{categoryLabel} · One-time</p><h2>{item.name}</h2><p>{item.description}</p>
    {now === null ? <p>Checking current pricing…</p> : <><div className={s.price}>{money(amount)} <small>one-time</small></div>{active && <p><del>{money(item.regularPrice)}</del> · Save {money(item.quote.discountAmount)} with {offer.title}<br/>Valid until {formatIndiaDateTime(offer.endsAt)}</p>}</>}
    <h3>What&apos;s included</h3><ul className={s.list}>{item.inclusions.map((line, i) => <li key={i}>{line}</li>)}</ul>
    <details><summary>Terms & exclusions</summary><ul className={s.list}>{(active ? item.quote.terms : item.terms).map((line, i) => <li key={i}>{line}</li>)}</ul></details>
    <a className={s.button} href={href}>Discuss this package →</a>
  </article>;
}
