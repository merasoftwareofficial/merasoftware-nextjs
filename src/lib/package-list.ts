import type { PackageBilling, ProjectCategory, QuotedPackage, SalesPackage } from "./sales-packages";

/**
 * Filter and sort for a list of packages: the public "Pricing & Packages" pages (components/campaign/staff-packages.tsx)
 * and the admin Packages tab (app/admin/packages/packages-manager.tsx). Pure, so the rules are tested in
 * tests/package-list.test.ts. Owner decisions, 12 Nov 2026: plans are not packages and never reach these lists; each
 * list offers only the types and categories it really has; a filter the list does not have falls back to All.
 */
export type PackageType = "one_time" | "monthly";
export type PackageSort = "default" | "price_asc" | "price_desc" | "added" | "modified";
export type PackageListOptions = { type: PackageType | "all"; category: string | "all"; sort: PackageSort; offersOnly: boolean };
export const DEFAULT_PACKAGE_LIST: PackageListOptions = { type: "all", category: "all", sort: "default", offersOnly: false };

/** What a list needs to know about one line. `price` is the price that line shows (null when unknown: sorted last); `offer` is true while an offer runs. */
export type Listable = { billing?: PackageBilling; category: string; createdAt?: string; updatedAt?: string; price: number | null; offer: boolean };
/** One line of a list: its facts plus the item it renders. */
export type Entry<T> = Listable & { item: T };

/** A package with no billing (saved before 8 Nov 2026) counts as one-time, the same as priceUnit() in sales-packages.ts. */
export const typeOf = (entry: Pick<Listable, "billing">): PackageType => (entry.billing === "monthly" ? "monthly" : "one_time");

/** A public package line. The price is the one the card shows (package-card.tsx): the offer price while an offer runs, otherwise the discounted price. */
export function publicEntry(item: QuotedPackage, offer: boolean): Entry<QuotedPackage> {
  return { item, billing: item.billing, category: item.category, createdAt: item.createdAt, updatedAt: item.updatedAt, offer,
    price: offer ? item.quote.finalPrice : item.discountedPrice ?? item.regularPrice };
}
/** An admin package line. The price is the one the admin line shows: the discounted price, else the main price. */
export function adminEntry<T>(item: T, row: Pick<SalesPackage, "billing" | "category" | "createdAt" | "updatedAt" | "discountedPrice" | "regularPrice">): Entry<T> {
  return { item, billing: row.billing, category: row.category, createdAt: row.createdAt, updatedAt: row.updatedAt, offer: false, price: row.discountedPrice ?? row.regularPrice };
}

/**
 * An admin line for a new package that is not published yet (a working copy with no catalogue package). Its facts are what the
 * admin typed so far; the admin line shows no price for it, so it has none to sort by. Its dates are the copy's own.
 */
export function draftEntry<T>(item: T, draft: { data: { item: Record<string, unknown> }; createdAt?: string; updatedAt?: string }): Entry<T> {
  const typed = draft.data.item;
  const billing = typed.billing === "monthly" || typed.billing === "one_time" ? typed.billing : undefined;
  return { item, billing, category: typeof typed.category === "string" ? typed.category : "", createdAt: draft.createdAt, updatedAt: draft.updatedAt, offer: false, price: null };
}

const timeOf = (value?: string) => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

/** The types a list has, in a fixed order; a type with no package is not offered. */
export function typeFilterChoices(entries: Listable[]): { value: PackageType; label: string; count: number }[] {
  const count = (type: PackageType) => entries.filter(entry => typeOf(entry) === type).length;
  return (["one_time", "monthly"] as PackageType[])
    .map(value => ({ value, label: value === "monthly" ? "Monthly" : "One-time", count: count(value) }))
    .filter(choice => choice.count > 0);
}

/** The categories a list has: the portal's order first, then any unknown key by first use, labelled by its key. */
export function categoryFilterChoices(entries: Listable[], categories: ProjectCategory[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  // A line with no category yet (a new draft) has no chip of its own; it still shows under All.
  for (const entry of entries) if (entry.category) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  const ordered = categories.map(category => category.category).filter(key => counts.has(key));
  const unknown = [...counts.keys()].filter(key => !ordered.includes(key));
  const labels = new Map(categories.map(category => [category.category, category.label]));
  return [...ordered, ...unknown].map(key => ({ value: key, label: labels.get(key) ?? key, count: counts.get(key) ?? 0 }));
}

/** A chosen type or category this list does not have falls back to All, so no filter can hide every package by mistake. */
export function usableOptions(options: PackageListOptions, entries: Listable[]): PackageListOptions {
  const type = options.type === "all" || typeFilterChoices(entries).some(choice => choice.value === options.type) ? options.type : "all";
  const category = options.category === "all" || entries.some(entry => entry.category === options.category) ? options.category : "all";
  return { ...options, type, category };
}

/**
 * The lines to show, in order.
 * - default: lines with a running offer first, then the order the list came in (the admin's order).
 * - price: the shown price, low to high or high to low; a line with no price goes last. With All, one-time lines come
 *   before monthly ones, because a monthly price is per month and the two are not comparable.
 * - added / modified: newest first; a line with no date goes last. Sorting is stable: equal values keep their order.
 */
export function arrangePackages<T extends Listable>(entries: T[], options: PackageListOptions): T[] {
  const list = entries.filter(entry => (options.type === "all" || typeOf(entry) === options.type)
    && (options.category === "all" || entry.category === options.category)
    && (!options.offersOnly || entry.offer));
  if (options.sort === "default") return [...list.filter(entry => entry.offer), ...list.filter(entry => !entry.offer)];
  if (options.sort === "price_asc" || options.sort === "price_desc") {
    const direction = options.sort === "price_asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (a.price === null || b.price === null) return a.price === b.price ? 0 : a.price === null ? 1 : -1;
      if (options.type === "all" && typeOf(a) !== typeOf(b)) return typeOf(a) === "one_time" ? -1 : 1;
      return direction * (a.price - b.price);
    });
  }
  const dateOf = options.sort === "added" ? (entry: T) => timeOf(entry.createdAt) : (entry: T) => timeOf(entry.updatedAt);
  return list.sort((a, b) => {
    const first = dateOf(a);
    const second = dateOf(b);
    if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
    return second - first;
  });
}
