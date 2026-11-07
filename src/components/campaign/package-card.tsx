import type { QuotedPackage } from "@/lib/sales-packages";
import { formatIndiaDateTime } from "@/lib/date-time";
import Link from "@/components/link";
import s from "./campaign.module.css";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export function PackageCard({ item, categoryLabel, now }: { item: QuotedPackage; categoryLabel: string; now: number | null }) {
  const offer = item.quote.offer;
  const active = now !== null && !!offer && now < Date.parse(offer.endsAt);
  const discountedPrice = item.discountedPrice ?? item.regularPrice;
  const amount = active ? item.quote.finalPrice : discountedPrice;
  return <article className={s.card}><p className={s.fine}>{categoryLabel} · One-time</p><h2>{item.name}</h2><p>{item.description}</p>
    {now === null ? <p>Checking current pricing…</p> : <><div className={s.price}>{money(amount)} <small>one-time</small></div>{active && <p><del>{money(item.regularPrice)}</del> · Save {money(item.quote.discountAmount)} with {offer.title}<br/>Valid until {formatIndiaDateTime(offer.endsAt)}</p>}{!active && discountedPrice < item.regularPrice && <p><del>{money(item.regularPrice)}</del> · Save {money(item.regularPrice - discountedPrice)}</p>}</>}
    <h3>What&apos;s included</h3><ul className={s.list}>{item.inclusions.map((line, i) => <li key={i}>{line}</li>)}</ul>
    <details><summary>Terms & exclusions</summary><ul className={s.list}>{(active ? item.quote.terms : item.terms).map((line, i) => <li key={i}>{line}</li>)}</ul></details>
    {/* Every package has its own page, with its offer when one runs (app/package/[id]). */}
    <Link className={s.button} href={`/package/${encodeURIComponent(item.id)}`}>View package →</Link>
  </article>;
}
