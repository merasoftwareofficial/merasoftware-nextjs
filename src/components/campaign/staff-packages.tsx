"use client";
import { useServerTime } from "@/components/use-server-time";
import { categoryLabel, type ProjectCategory, type QuotedPackage } from "@/lib/sales-packages";
import { PackageCard } from "./package-card";
import Link from "@/components/link";
import s from "./campaign.module.css";
/** One package page (lib/package-pages.ts): its own heading and introduction above its packages. */
export function StaffPackages({ title, intro, items, categories }: { title: string; intro: string; items: QuotedPackage[]; categories?: ProjectCategory[] }) {
  const now = useServerTime();
  return <div className={s.staff}>
    <section className={s.showcaseHero}><p className={s.kicker}>PRICING &amp; PACKAGES</p><h1>{title}</h1><p>{intro}</p><div className={s.pills}><span>{items.length} packages</span></div><div className={s.actions}><Link className={s.button} href="/offer">Explore offers →</Link></div></section>
    {!items.length && <p>No packages are available right now. Contact us for a quotation.</p>}
    <div className={s.grid}>{items.map(item => <PackageCard key={item.id} item={item} categoryLabel={categoryLabel(categories, item.category)} now={now} />)}</div>
  </div>;
}
