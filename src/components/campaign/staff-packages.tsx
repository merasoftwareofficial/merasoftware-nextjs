"use client";
import { useState } from "react";
import { useServerTime } from "@/components/use-server-time";
import { arrangePackages, categoryChoices, DEFAULT_PACKAGE_LIST, typeChoices, usableOptions, type PackageListOptions, type PackageSort } from "@/lib/package-list";
import { type ProjectCategory, type QuotedPackage } from "@/lib/sales-packages";
import { PackageCard, packageOfferRunning, timeLeft } from "./package-card";
import s from "./campaign.module.css";

const SORTS: { value: PackageSort; label: string }[] = [
  { value: "default", label: "Default (offers first)" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "added", label: "Recently added" },
  { value: "modified", label: "Recently modified" },
];

/** One row of filter chips: All plus the choices this page has, each with its count. */
function FilterRow({ label, choices, selected, onPick }: { label: string; choices: { value: string; label: string; count: number }[]; selected: string; onPick: (value: string) => void }) {
  return <div className={s.pkgFilterRow} role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
    <span className={s.pkgFilterLabel}>{label}</span>
    {choices.map(choice => <button key={choice.value} type="button" className={s.pkgChip} aria-pressed={selected === choice.value} onClick={() => onPick(choice.value)}>{choice.label} <span className={s.pkgCount}>{choice.count}</span></button>)}
  </div>;
}

/**
 * One package page (lib/package-pages.ts): its own heading and introduction above its packages.
 * Filters (lib/package-list.ts): type (one-time / monthly) and category, each row shown only when the page has
 * more than one choice; a sort (default, price, recently added, recently modified). The default is offers first, then
 * the admin's order, so an offer never leaves a half-empty row. "All packages" / "Offers running" switch the list while an
 * offer runs. Plans are not packages and never appear here.
 */
export function StaffPackages({ title, intro, items, categories }: { title: string; intro: string; items: QuotedPackage[]; categories: ProjectCategory[] }) {
  const now = useServerTime();
  const [chosen, setChosen] = useState<PackageListOptions>(DEFAULT_PACKAGE_LIST);
  const isOffer = (item: QuotedPackage) => packageOfferRunning(item, now);
  const offers = items.filter(isOffer);
  // The options that apply to this page right now: a filter that no longer has packages falls back to All.
  const options = usableOptions({ ...chosen, offersOnly: chosen.offersOnly && offers.length > 0 }, items);
  const shown = arrangePackages(items, options, isOffer);
  const types = typeChoices(items);
  const cats = categoryChoices(items, categories);
  const change = (patch: Partial<PackageListOptions>) => setChosen(current => ({ ...current, ...patch }));
  // The offer that ends first, for the countdown on the tab.
  const soonest = offers.map(item => item.quote.offer!.endsAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return <div className={s.staff}>
    {/* Compact heading, so the first row of packages shows without scrolling. */}
    <header className={s.pkgHero}><p className={s.kicker}>PRICING &amp; PACKAGES</p><h1>{title}</h1>{intro && <p>{intro}</p>}</header>
    {!items.length && <p>No packages are available right now. Contact us for a quotation.</p>}
    {offers.length > 0 && <div className={s.pkgTabs} role="group" aria-label="Show packages">
      <button type="button" className={s.pkgTab} aria-pressed={!options.offersOnly} onClick={() => change({ offersOnly: false })}>All packages <span className={s.pkgCount}>{items.length}</span></button>
      <button type="button" className={`${s.pkgTab} ${s.pkgTabOffer}`} aria-pressed={options.offersOnly} onClick={() => change({ offersOnly: true })}><i aria-hidden="true" />Offers running <span className={s.pkgCount}>{offers.length}</span><span className={s.pkgEnds}>· ends in {timeLeft(soonest, now)}</span></button>
    </div>}
    {items.length > 0 && <div className={s.pkgFilters}>
      {types.length > 1 && <FilterRow label="Type" choices={[{ value: "all", label: "All", count: items.length }, ...types]} selected={options.type} onPick={value => change({ type: value as PackageListOptions["type"] })} />}
      {cats.length > 1 && <FilterRow label="Category" choices={[{ value: "all", label: "All", count: items.length }, ...cats]} selected={options.category} onPick={value => change({ category: value })} />}
      {items.length > 1 && <label className={s.pkgSort}><span>Sort by</span><select value={options.sort} onChange={event => change({ sort: event.target.value as PackageSort })}>{SORTS.map(sort => <option key={sort.value} value={sort.value}>{sort.label}</option>)}</select></label>}
    </div>}
    {items.length > 0 && !shown.length && <div className={s.pkgFilterEmpty}><p>No packages match this filter.</p><button type="button" className={s.pkgChip} onClick={() => setChosen(DEFAULT_PACKAGE_LIST)}>Show all packages</button></div>}
    <div className={s.pkgGrid}>{shown.map(item => <PackageCard key={item.id} item={item} now={now} />)}</div>
  </div>;
}
