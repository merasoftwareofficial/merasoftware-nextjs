import type { ProjectCategory, QuotedPackage } from "./sales-packages";

/**
 * Filter and sort for one "Pricing & Packages" page (components/campaign/staff-packages.tsx). Pure, so the rules
 * are tested in tests/package-list.test.ts. Owner decisions, 12 Nov 2026: plans are not packages and never reach
 * this list; each page offers only the types and categories it really has; the default keeps the offers first.
 */
export type PackageType = "one_time" | "monthly";
export type PackageSort = "default" | "price_asc" | "price_desc" | "added" | "modified";
export type PackageListOptions = { type: PackageType | "all"; category: string | "all"; sort: PackageSort; offersOnly: boolean };
export const DEFAULT_PACKAGE_LIST: PackageListOptions = { type: "all", category: "all", sort: "default", offersOnly: false };

/** A package with no billing (saved before 8 Nov 2026) counts as one-time, the same as priceUnit() in sales-packages.ts. */
export const typeOf = (item: QuotedPackage): PackageType => (item.billing === "monthly" ? "monthly" : "one_time");

/** The price the card shows (package-card.tsx): the offer price while an offer runs, otherwise the discounted price. */
export const shownPrice = (item: QuotedPackage, isOffer: boolean) => (isOffer ? item.quote.finalPrice : item.discountedPrice ?? item.regularPrice);

/** Milliseconds of a stored date, or null when the package has none (or it is not a date). */
const timeOf = (value?: string) => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : ms;
};

/** The types this page has, in a fixed order; a type with no package is not offered. */
export function typeChoices(items: QuotedPackage[]): { value: PackageType; label: string; count: number }[] {
  const count = (type: PackageType) => items.filter(item => typeOf(item) === type).length;
  return (["one_time", "monthly"] as PackageType[])
    .map(value => ({ value, label: value === "monthly" ? "Monthly" : "One-time", count: count(value) }))
    .filter(choice => choice.count > 0);
}

/** The categories this page has: the portal's order first, then any unknown key by first use, labelled by its key. */
export function categoryChoices(items: QuotedPackage[], categories: ProjectCategory[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const ordered = categories.map(entry => entry.category).filter(key => counts.has(key));
  const unknown = [...counts.keys()].filter(key => !ordered.includes(key));
  const labels = new Map(categories.map(entry => [entry.category, entry.label]));
  return [...ordered, ...unknown].map(key => ({ value: key, label: labels.get(key) ?? key, count: counts.get(key) ?? 0 }));
}

/** A chosen type or category that this page does not have falls back to All, so no filter can hide every package by mistake. */
export function usableOptions(options: PackageListOptions, items: QuotedPackage[]): PackageListOptions {
  const type = options.type === "all" || typeChoices(items).some(choice => choice.value === options.type) ? options.type : "all";
  const category = options.category === "all" || items.some(item => item.category === options.category) ? options.category : "all";
  return { ...options, type, category };
}

/**
 * The packages to show, in order.
 * - default: packages with a running offer first, then the admin's order (the page's order as it came in).
 * - price: the shown price, low to high or high to low. With All, one-time packages come before monthly ones,
 *   because a monthly price is per month and the two are not comparable.
 * - added / modified: newest first. A package with no date for it goes last, in the admin's order.
 * Sorting is stable, so equal values keep the admin's order.
 */
export function arrangePackages(items: QuotedPackage[], options: PackageListOptions, isOffer: (item: QuotedPackage) => boolean): QuotedPackage[] {
  const list = items.filter(item => (options.type === "all" || typeOf(item) === options.type)
    && (options.category === "all" || item.category === options.category)
    && (!options.offersOnly || isOffer(item)));
  if (options.sort === "default") return [...list.filter(isOffer), ...list.filter(item => !isOffer(item))];
  if (options.sort === "price_asc" || options.sort === "price_desc") {
    const direction = options.sort === "price_asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (options.type === "all" && typeOf(a) !== typeOf(b)) return typeOf(a) === "one_time" ? -1 : 1;
      return direction * (shownPrice(a, isOffer(a)) - shownPrice(b, isOffer(b)));
    });
  }
  const dateOf = options.sort === "added" ? (item: QuotedPackage) => timeOf(item.createdAt) : (item: QuotedPackage) => timeOf(item.updatedAt);
  return list.sort((a, b) => {
    const first = dateOf(a);
    const second = dateOf(b);
    if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
    return second - first;
  });
}
