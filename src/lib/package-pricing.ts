import type { AddOn, PricingSnapshot, ServiceChoice } from "./sales-packages";

// A one-time package is priced from its category and add-on services (owner decision 10 Nov 2026). This is the
// admin form's preview of what the portal backend decides (helpers/salesPackages.js priceFromCatalogue): the
// backend reads every price itself and refuses a main price that does not match. The same fixtures run against
// both (tests/package-pricing.test.ts here, backend tests/packageServicesPricing.test.js).
//   · a new package takes today's category base price and add-on prices;
//   · a saved package keeps the prices it was saved with (only the quantity of an add-on may change);
//   · an add-on added later takes today's price; a different category, or "Update to current prices", takes all afresh.

const money = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** What the portal's own add-on list offers for a category: not hidden, for all categories or this one. */
export const addOnOffered = (addOn: AddOn, category: string) => !addOn.isHidden && (!addOn.compatibleWith.length || addOn.compatibleWith.includes(category));

export type PricedLine = { featureId: string; name: string; unitPrice: number; quantity: number; price: number; frozen: boolean; isQuantityBased: boolean; offered: boolean };
/** `terms`: the terms the package gets automatically (category, then each add-on), as the backend freezes them. */
export type PricePreview = { base: number | null; baseFrozen: boolean; lines: PricedLine[]; total: number | null; problems: string[]; terms: string[] };

/** The saved package this one is edited from: its category and frozen prices (missing for a new or hand-priced package). */
export type SavedPricing = { category: string; pricing?: PricingSnapshot } | undefined;

export function previewPrice({ category, basePrice, categoryTerms = [], choices, addOns, saved, refresh = false }: {
  category: string; basePrice: number | null | undefined; categoryTerms?: string[]; choices: ServiceChoice[]; addOns: AddOn[]; saved?: SavedPricing; refresh?: boolean;
}): PricePreview {
  const problems: string[] = [];
  const reuse = !!saved?.pricing && saved.category === category && !refresh;
  let base: number | null;
  if (reuse) base = saved!.pricing!.categoryBasePrice;
  else if (basePrice === null || basePrice === undefined) { base = null; problems.push("This category has no base price yet. Set its base price first."); }
  else base = basePrice;
  const terms = new Set<string>(reuse ? (saved!.pricing!.categoryTerms ?? []) : categoryTerms);
  const frozen = new Map(reuse ? saved!.pricing!.services.map(row => [row.featureId, row]) : []);
  const catalogue = new Map(addOns.map(row => [row.id, row]));
  const lines: PricedLine[] = [];
  for (const choice of choices) {
    const kept = frozen.get(choice.featureId);
    const live = catalogue.get(choice.featureId);
    const source = kept ?? (live && addOnOffered(live, category) ? live : undefined);
    if (!source) {
      const old = saved?.pricing?.services.find(row => row.featureId === choice.featureId);
      problems.push(old ? `${old.name} is no longer offered; remove it.` : "An add-on is not offered for this category. Remove it.");
      lines.push({ featureId: choice.featureId, name: old?.name ?? live?.name ?? "Unavailable add-on", unitPrice: 0, quantity: choice.quantity, price: 0, frozen: !!kept, isQuantityBased: !!old?.isQuantityBased, offered: false });
      continue;
    }
    const isQuantityBased = !!source.isQuantityBased;
    const quantity = isQuantityBased ? choice.quantity : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) problems.push(`Quantity for ${source.name} must be 1 to 1000.`);
    const unitPrice = kept ? kept.unitPrice : (live as AddOn).unitPrice;
    lines.push({ featureId: choice.featureId, name: source.name, unitPrice, quantity, price: money(unitPrice * quantity), frozen: !!kept, isQuantityBased, offered: kept ? !!(live && addOnOffered(live, category)) : true });
    // A saved add-on keeps the terms it was saved with; an add-on that had none when saved stays without (no backfill).
    for (const line of kept ? (kept.terms ?? []) : (live?.terms ?? [])) terms.add(line);
  }
  const total = base === null || problems.length ? null : money(base + lines.reduce((sum, row) => sum + row.price, 0));
  return { base, baseFrozen: reuse, lines, total, problems, terms: [...terms] };
}

/** The terms a package got automatically from its category and add-ons when it was saved (the backend freezes them in pricing). */
export const automaticTermsOf = (pricing?: PricingSnapshot): string[] =>
  pricing ? [...new Set([...(pricing.categoryTerms ?? []), ...pricing.services.flatMap(row => row.terms ?? [])])] : [];

/** The admin's own terms of a saved package: its terms without the automatic ones, which the form shows read-only. */
export const typedTermsOf = (terms: string[], pricing?: PricingSnapshot): string[] => {
  const automatic = new Set(automaticTermsOf(pricing));
  return terms.filter(line => !automatic.has(line));
};

/**
 * The package's Terms box shows the terms that come with its category and add-ons first (the same lines the backend adds on save),
 * then the admin's own. The form keeps only the admin's own lines (see typedTermsOf); these two turn that into the box's text and back.
 */
export const termsBoxText = (automatic: string[], typed: string[]): string => {
  const own = new Set(automatic);
  return [...automatic, ...typed.filter(line => !own.has(line))].join("\n");
};
/** The admin's own lines of the box's text: a line that is an automatic one is not the admin's (it comes back by itself). */
export const typedFromTermsBox = (text: string, automatic: string[]): string[] => {
  const own = new Set(automatic);
  return text.split("\n").filter(line => !own.has(line));
};

/** Choices that still make sense after the category changes: kept as saved when the category did not change, else only offered ones. */
export function choicesForCategory(choices: ServiceChoice[], category: string, addOns: AddOn[], saved?: SavedPricing): ServiceChoice[] {
  const keep = new Set(saved?.pricing && saved.category === category ? saved.pricing.services.map(row => row.featureId) : []);
  return choices.filter(choice => keep.has(choice.featureId) || addOns.some(row => row.id === choice.featureId && addOnOffered(row, category)));
}
