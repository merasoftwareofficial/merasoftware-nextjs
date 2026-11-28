"use client";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { CapsuleSelect } from "@/components/capsule-select";
import { NumberInput } from "@/components/number-input";
import {
  ADD_ON_SORTS,
  DEFAULT_ADD_ON_SORT,
  matchesAddOnSearch,
  readAddOnSort,
  rememberAddOnSort,
  sortAddOns,
  type AddOnSort,
} from "@/lib/add-ons";
import { addOnOffered, type PricePreview, type SavedPricing } from "@/lib/package-pricing";
import type { AddOn, ProjectCategory, ServiceChoice } from "@/lib/sales-packages";
import s from "./packages-manager.module.css";

const rupee = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const noSubscription = () => () => {};

// A one-time package's price (owner decision 10 Nov 2026): the category's base price plus the add-on services ticked here,
// the same parts a custom project is priced from. The main price is shown, never typed; the portal backend reads every
// price itself and freezes them when the package is saved (a later change of the category or of an add-on never reaches a
// saved package). The discount price is typed, as before; an offer then adds the third price.
type Props = {
  category: string; categoryEntry?: ProjectCategory; addOns: AddOn[]; choices: ServiceChoice[]; saved?: SavedPricing; refresh: boolean;
  preview: PricePreview; regularPrice: number; discountedPrice: number; error: (key: string) => ReactNode; bad: (key: string) => string | undefined;
  onToggle: (addOn: AddOn, on: boolean) => void; onQuantity: (id: string, quantity: number) => void; onRefresh: (on: boolean) => void;
  onDiscount: (value: number) => void; onNewAddOn: () => void; onEditAddOn: (addOn: AddOn) => void;
};
export function PackagePriceBuilder({ category, categoryEntry, addOns, choices, saved, refresh, preview, regularPrice, discountedPrice, error, bad,
  onToggle, onQuantity, onRefresh, onDiscount, onNewAddOn, onEditAddOn }: Props) {
  const [search, setSearch] = useState("");
  const rememberedSort = useSyncExternalStore(noSubscription, readAddOnSort, () => DEFAULT_ADD_ON_SORT);
  const [pickedSort, setPickedSort] = useState<AddOnSort | null>(null);
  const sort = pickedSort ?? rememberedSort;
  const pickSort = (next: AddOnSort) => { setPickedSort(next); rememberAddOnSort(next); };
  const chosen = new Map(choices.map(row => [row.featureId, row]));
  const offered = useMemo(() => addOns.filter(row => addOnOffered(row, category)), [addOns, category]);
  const visibleOffered = useMemo(
    () => sortAddOns(offered.filter(row => matchesAddOnSearch(row, search)), sort),
    [offered, search, sort],
  );
  // A saved add-on that is no longer offered stays in the package as it was saved, and can be removed.
  const withdrawn = preview.lines.filter(line => !offered.some(row => row.id === line.featureId));
  const line = (id: string) => preview.lines.find(row => row.featureId === id);
  const discount = regularPrice > 0 && discountedPrice < regularPrice ? { amount: Math.round((regularPrice - discountedPrice) * 100) / 100, percent: Math.round((1 - discountedPrice / regularPrice) * 1000) / 10 } : null;
  return <div role="group" aria-label="Price from category and add-ons">
    <p className={s.note}>The main price is made from the category&apos;s base price and the add-ons you tick, the same prices a custom project uses. It is fixed when you save the package: later price changes do not reach a saved package.</p>
    {!category ? <p className={s.note}>Choose a project category above to see its base price and add-ons.</p> : <>
      <p className={s.breakdown}>Base price of <b>{categoryEntry?.label ?? category}</b>: {preview.base === null ? <b>not set</b> : <b>{rupee(preview.base)}</b>}{preview.baseFrozen && " (as saved)"}</p>
      {offered.length > 0 && (
        <div className={s.addOnControls}>
          <input
            type="search"
            className={s.addOnSearch}
            aria-label="Search add-ons"
            placeholder="Search add-ons by keyword…"
            value={search}
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
          />
          <CapsuleSelect
            prefix="Sort:"
            ariaLabel="Sort add-ons"
            align="right"
            value={sort}
            onChange={value => pickSort(value as AddOnSort)}
            options={ADD_ON_SORTS}
          />
        </div>
      )}
      <div className={s.addOnList} role="group" aria-label="Add-on services">
        {visibleOffered.map(row => {
          const picked = chosen.get(row.id), priced = line(row.id);
          const todayDiffers = priced?.frozen && priced.unitPrice !== row.unitPrice;
          return <div className={s.addOnRow} key={row.id}>
            <label><input type="checkbox" checked={!!picked} onChange={event => onToggle(row, event.target.checked)} /> <span><b>{row.name}</b> · {rupee(priced?.frozen ? priced.unitPrice : row.unitPrice)}{row.isQuantityBased ? " each" : ""}
              {todayDiffers && <small> (saved price; today {rupee(row.unitPrice)})</small>}</span></label>
            {picked && row.isQuantityBased ? <NumberInput className={s.addOnQty} min={1} max={1000} step={1} aria-label={`Quantity of ${row.name}`} value={picked.quantity} onValueChange={n => onQuantity(row.id, n)} onEmpty={() => onQuantity(row.id, Number.NaN)} /> : <span />}
            <button type="button" className="admin-action" aria-label={`Edit ${row.name}`} onClick={() => onEditAddOn(row)}>Edit</button>
          </div>;
        })}
        {withdrawn.map(row => <div className={`${s.addOnRow} ${s.addOnOff}`} key={row.featureId}>
          <label><span><b>{row.name}</b> · {rupee(row.unitPrice)} <small>No longer offered{row.frozen ? "; kept as saved" : ""}.</small></span></label>
          <span />
          <button type="button" className="admin-action" aria-label={`Remove ${row.name}`} onClick={() => onToggle({ id: row.featureId, name: row.name, unitPrice: row.unitPrice, description: "", isHidden: false, isQuantityBased: row.isQuantityBased, compatibleWith: [], terms: [] }, false)}>Remove</button>
        </div>)}
        {offered.length > 0 && !visibleOffered.length && (
          <p className={s.note}>No add-ons match &ldquo;{search.trim()}&rdquo;. <button type="button" className="admin-action" onClick={() => setSearch("")}>Clear search</button></p>
        )}
        {!offered.length && !withdrawn.length && <p className={s.note}>No add-on is offered for this category yet.</p>}
      </div>
      <div className={s.priceActions}><button type="button" className="admin-action" onClick={onNewAddOn}>+ New add-on</button>
        {saved?.pricing && saved.category === category && <button type="button" className="admin-action" onClick={() => onRefresh(!refresh)}>{refresh ? "Keep the saved prices" : "Update to current prices"}</button>}</div>
      {refresh && <p className={s.warnNote}>On save, the base price and every add-on take today&apos;s prices instead of the saved ones.</p>}
      {preview.lines.length > 0 && <p className={s.breakdown}>{preview.base !== null && <>Base {rupee(preview.base)}</>}{preview.lines.map(row => <span key={row.featureId}> + {row.name}{row.quantity > 1 ? ` × ${row.quantity}` : ""} {rupee(row.price)}</span>)}</p>}
      {error("services")}
    </>}
    <div className={s.cols3} role="group" aria-label="Prices">
      <div className={`admin-field ${bad("regularPrice") ?? ""}`}><span>Main price (₹ one-time)</span><p className={s.mainPrice} aria-label="Main price (₹)">{preview.total === null ? "—" : rupee(preview.total)}</p><small>Made from the parts above. Shown crossed out.</small>{error("regularPrice")}</div>
      <label className={`admin-field ${bad("discountedPrice") ?? ""}`}><span>Discount price (₹) *</span><NumberInput aria-label="Discount price (₹)" min={0} max={10000000} step="0.01" value={discountedPrice} onValueChange={onDiscount} onEmpty={() => onDiscount(Number.NaN)} />
        <small>{discount ? `₹${discount.amount.toLocaleString("en-IN")} discount (${discount.percent}% off). ` : "Same as the main price: no discount. "}What the customer pays when no offer runs.</small>{error("discountedPrice")}</label>
    </div>
  </div>;
}
