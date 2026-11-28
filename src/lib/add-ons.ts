import { z } from "zod";
import type { AddOn } from "./sales-packages";

// An add-on service of the portal catalogue (Additional Features / Upgrades), edited from the package form. The portal's
// own form sends exactly these fields (frontend AdminFeatureProductsPage.js) and its generic product routes save whatever
// they are sent, so the website forwards only this fixed shape; the category is always `feature_upgrades`.
export const addOnSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  name: z.string().trim().min(1, "Enter the add-on name.").max(120, "At most 120 characters."),
  unitPrice: z.number().finite().min(0, "The price cannot be negative.").max(10000000, "Too large.").refine(value => Math.abs(Math.round(value * 100) / 100 - value) < 1e-9, "At most two decimal places."),
  description: z.string().trim().max(1000, "At most 1000 characters."),
  isHidden: z.boolean(),
  isQuantityBased: z.boolean(),
  // Empty = offered for every category (the portal's rule).
  compatibleWith: z.array(z.string().regex(/^[a-z][a-z0-9_]{2,39}$/)).max(100),
  // Terms & conditions, one per line; a package that includes this add-on gets them automatically.
  terms: z.array(z.string().trim().max(1500, "At most 1500 characters per line.")).max(50, "At most 50 lines.").default([]).transform(lines => lines.filter(Boolean)),
}).strict();
export type AddOnInput = z.infer<typeof addOnSchema>;
export const addOnRemoveSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  mode: z.enum(["catalog_only", "remove_from_packages"]).optional().default("catalog_only"),
}).strict();

/** The portal's product body for an add-on. Price and selling price are one price, as the portal form saves them. */
export function portalAddOnBody(input: AddOnInput): Record<string, unknown> {
  return {
    ...(input.id ? { _id: input.id } : {}),
    serviceName: input.name,
    category: "feature_upgrades",
    price: input.unitPrice,
    sellingPrice: input.unitPrice,
    formattedDescriptions: input.description ? [{ content: input.description }] : [],
    isHidden: input.isHidden,
    isQuantityBased: input.isQuantityBased,
    compatibleWith: input.compatibleWith,
    terms: input.terms,
  };
}

export const blankAddOn = (): AddOnInput => ({ name: "", unitPrice: 0, description: "", isHidden: false, isQuantityBased: false, compatibleWith: [], terms: [] });
export const addOnInput = (row: AddOn): AddOnInput => ({ id: row.id, name: row.name, unitPrice: row.unitPrice, description: row.description, isHidden: row.isHidden, isQuantityBased: row.isQuantityBased, compatibleWith: [...row.compatibleWith], terms: [...(row.terms ?? [])] });

/** SSOT Add-on sort & search helpers shared by Add-ons Manager and Package Price Builder. */
export type AddOnSort = "modified" | "added" | "name_asc" | "name_desc" | "price_asc" | "price_desc";
export const ADD_ON_SORT_KEY = "add-on-list-sort";
export const DEFAULT_ADD_ON_SORT: AddOnSort = "modified";
export const ADD_ON_SORTS: { value: AddOnSort; label: string }[] = [
  { value: "modified", label: "Recently modified" },
  { value: "added", label: "Recently added" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "name_desc", label: "Name: Z to A" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export function readAddOnSort(): AddOnSort {
  try {
    const saved = window.localStorage.getItem(ADD_ON_SORT_KEY);
    return ADD_ON_SORTS.find(s => s.value === saved)?.value ?? DEFAULT_ADD_ON_SORT;
  } catch { return DEFAULT_ADD_ON_SORT; }
}

export function rememberAddOnSort(sort: AddOnSort) {
  try { window.localStorage.setItem(ADD_ON_SORT_KEY, sort); }
  catch { /* Ignore blocked storage */ }
}

function addOnTimeOf(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function sortAddOns(list: AddOn[], sort: AddOnSort): AddOn[] {
  const byName = (a: AddOn, b: AddOn) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return [...list].sort((a, b) => {
    if (sort === "name_asc") return byName(a, b);
    if (sort === "name_desc") return byName(b, a);
    if (sort === "price_asc") return (a.unitPrice - b.unitPrice) || byName(a, b);
    if (sort === "price_desc") return (b.unitPrice - a.unitPrice) || byName(a, b);
    const first = addOnTimeOf(sort === "added" ? a.createdAt : a.updatedAt);
    const second = addOnTimeOf(sort === "added" ? b.createdAt : b.updatedAt);
    if (first === null || second === null) return first === second ? byName(a, b) : first === null ? 1 : -1;
    return (second - first) || byName(a, b);
  });
}

export function matchesAddOnSearch(row: Pick<AddOn, "name" | "description">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || (row.description || "").toLowerCase().includes(q);
}

// The checks of the add-on routes (app/api/add-ons), apart from the network so they can be tested: what the portal is
// asked is only ever the fixed shape above, only for a service that really is in the add-on list, and with known categories.
export type AddOnDeps = {
  catalogue: () => Promise<{ categories?: { category: string }[]; addOns?: { id: string }[] }>;
  forward: (action: "create" | "update" | "remove" | "removeEverywhere", body: Record<string, unknown>) => Promise<unknown>;
};
export type AddOnResult = { status: number; body: { id: string; updatedPackages?: string[] } | { error: string } };
export async function saveAddOn(raw: unknown, deps: AddOnDeps): Promise<AddOnResult> {
  const parsed = addOnSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: parsed.error.issues[0]?.message ?? "Check the add-on fields." } };
  const catalogue = await deps.catalogue();
  const known = new Set((catalogue.categories ?? []).map(row => row.category));
  if (parsed.data.compatibleWith.some(key => !known.has(key))) return { status: 400, body: { error: "Choose categories from the list." } };
  if (parsed.data.id && !(catalogue.addOns ?? []).some(row => row.id === parsed.data.id)) return { status: 404, body: { error: "This add-on was not found. Refresh and try again." } };
  const saved = await deps.forward(parsed.data.id ? "update" : "create", portalAddOnBody(parsed.data)) as { _id?: string } | null;
  return { status: parsed.data.id ? 200 : 201, body: { id: String(saved?._id ?? parsed.data.id ?? "") } };
}
export async function removeAddOn(raw: unknown, deps: AddOnDeps): Promise<AddOnResult> {
  const parsed = addOnRemoveSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Choose an add-on to delete." } };
  if (!((await deps.catalogue()).addOns ?? []).some(row => row.id === parsed.data.id)) return { status: 404, body: { error: "This add-on was not found. Refresh and try again." } };
  if (parsed.data.mode === "remove_from_packages") {
    const res = await deps.forward("removeEverywhere", { addOnId: parsed.data.id }) as { updatedPackages?: string[] } | null;
    return { status: 200, body: { id: parsed.data.id, updatedPackages: Array.isArray(res?.updatedPackages) ? res.updatedPackages : [] } };
  }
  // The portal refuses a service customers have already bought; its message is shown as it is.
  await deps.forward("remove", { _id: parsed.data.id });
  return { status: 200, body: { id: parsed.data.id } };
}
