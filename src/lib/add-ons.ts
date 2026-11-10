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
}).strict();
export type AddOnInput = z.infer<typeof addOnSchema>;
export const addOnRemoveSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

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
  };
}

export const blankAddOn = (): AddOnInput => ({ name: "", unitPrice: 0, description: "", isHidden: false, isQuantityBased: false, compatibleWith: [] });
export const addOnInput = (row: AddOn): AddOnInput => ({ id: row.id, name: row.name, unitPrice: row.unitPrice, description: row.description, isHidden: row.isHidden, isQuantityBased: row.isQuantityBased, compatibleWith: [...row.compatibleWith] });

// The checks of the add-on routes (app/api/add-ons), apart from the network so they can be tested: what the portal is
// asked is only ever the fixed shape above, only for a service that really is in the add-on list, and with known categories.
export type AddOnDeps = {
  catalogue: () => Promise<{ categories?: { category: string }[]; addOns?: { id: string }[] }>;
  forward: (action: "create" | "update" | "remove", body: Record<string, unknown>) => Promise<unknown>;
};
export type AddOnResult = { status: number; body: { id: string } | { error: string } };
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
  // The portal refuses a service customers have already bought; its message is shown as it is.
  await deps.forward("remove", { _id: parsed.data.id });
  return { status: 200, body: { id: parsed.data.id } };
}
