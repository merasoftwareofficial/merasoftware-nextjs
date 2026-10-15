"use client";
import { useState } from "react";
import { packages, categories, money, type Category, type Package } from "@/lib/campaign-packages";
import { PackageCard } from "./package-card";
import s from "./campaign.module.css";
export function StaffPackages({ staff = false }: { staff?: boolean }) {
  const [category, setCategory] = useState<Category>("social");
  const selected = packages.filter(p => p.category === category);
  function enquire(plan: Package) {
    const subject = encodeURIComponent(`${plan.name} package enquiry`);
    const body = encodeURIComponent(`Hello, I am interested in the ${plan.name} package. Please confirm the scope, pricing and terms for my business.`);
    window.location.href = `mailto:contact@merasoftware.com?subject=${subject}&body=${body}`;
  }
  return <div className={s.staff}>
    <section className={s.showcaseHero}><p className={s.kicker}>DIGITAL MARKETING & WEBSITE PACKAGES</p><h1>Every business has a next step.<br/><em>Find the right package.</em></h1><p>One-time setup, ongoing promotion or a complete business website. Compare the scope and pricing in one place.</p><div className={s.pills}><span>{packages.length} packages</span><span>{Object.keys(categories).length} service categories</span><span>Clear monthly & website pricing</span></div><div className={s.actions}><a className={s.button} href="/offer" target="_blank" rel="noreferrer">Explore offers ↗</a></div></section>
    <div className={s.tabs}>{Object.entries(categories).map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id as Category)}>{label}</button>)}</div>
    <h2>{categories[category]}</h2><p className={s.fine}>{staff ? "Compare packages below. Open quotation notes when preparing a client proposal." : "Compare inclusions and pricing, then discuss the right scope for your business. Taxes, delivery, hosting and service terms will be confirmed before payment."}</p>
    <div className={s.tableWrap}><table className={s.table}><caption>Compare {categories[category]}</caption><thead><tr><th>Package</th><th>Price</th><th>Reels</th><th>Photos</th><th>Shoots</th><th>Website</th><th>Ad budget</th></tr></thead><tbody>{selected.map(p => <tr key={p.id}><td>{p.name}</td><td>{money(p.price)} {p.cadence}</td><td>{p.reels ?? "—"}</td><td>{p.photos ?? "—"}</td><td>{p.shoots ?? "—"}</td><td>{p.website ?? "—"}</td><td>{["premium", "complete", "pro"].includes(p.id) ? "Up to ₹2,000" : "Not listed"}</td></tr>)}</tbody></table></div>
    <div className={s.grid}>{selected.map(p => <PackageCard plan={p} staff={staff} onSelect={staff ? undefined : enquire} key={p.id}/>)}</div>
    {staff && <section className={s.section}><h2>Call & quotation guide</h2><div className={s.card}><ul className={s.list}><li>Setup is one-time. Social and combined plans are monthly. Website-only payment terms need confirmation.</li><li>Basic, Growth and Growth Plus: 4 / 6 / 8 reels respectively. Each includes 4 photo posts and requires client-provided raw content.</li><li>Professional: 1 shoot and 8 photo posts. Professional Plus: 2 shoots plus Q&A / polls. Premium: up to 4 shoots and up to ₹2,000 ad budget.</li><li>Business Complete includes a static website; Business Pro includes a dynamic website. Confirm dynamic functionality before recommending.</li><li>Confirm domain, hosting, taxes, shoot travel, SEO scope, updates, delivery, combined-plan commitment and website ownership before quoting.</li></ul></div></section>}
  </div>;
}
