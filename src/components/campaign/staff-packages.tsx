"use client";
import { useServerTime } from "@/components/use-server-time";
import { categoryLabel, type ProjectCategory, type QuotedPackage } from "@/lib/sales-packages";
import { PackageCard } from "./package-card";
import Link from "@/components/link";
import s from "./campaign.module.css";
export function StaffPackages({ items, categories }: { items: QuotedPackage[]; categories?: ProjectCategory[] }) {
  const now = useServerTime();
  return <div className={s.staff}>
    <section className={s.showcaseHero}><p className={s.kicker}>BUSINESS STARTER PACKAGES</p><h1>Your business,<br/><em>ready to go online.</em></h1><p>Compare one-time website and business setup packages. We confirm the scope, timeline and applicable taxes before payment. Our team prepares your project in the client portal.</p><div className={s.pills}><span>{items.length} packages</span><span>One-time setup</span></div><div className={s.actions}><Link className={s.button} href="/offer">Explore offers →</Link></div></section>
    {!items.length && <p>No packages are available right now. Contact us for a quotation.</p>}
    <div className={s.grid}>{items.map(item => <PackageCard key={item.id} item={item} categoryLabel={categoryLabel(categories, item.category)} now={now} />)}</div>
  </div>;
}
