import { offerSchema, type Offer } from "@/lib/offers";
import type { SalesPackage } from "@/lib/sales-packages";

// Package offers (owner decisions, 25 October 2026; src/docs/dynamic-offers.md):
// - Every new offer is for exactly one package (offer.packageId, fixed after creation).
// - The package owns the two struck prices, the included work and the terms. The offer keeps a
//   synced copy, written only by syncOfferWithPackage, because the public page and the backend
//   read offers from website settings without calling the package catalogue.
// - The admin sets only the offer price (fixed) and the page design.
// - A package has at most one running offer: published and not yet expired. Drafts do not count.
// Offers saved before package offers existed have no packageId and are left exactly as they are.

export type PackageSource = Pick<SalesPackage, "id" | "name" | "category" | "status" | "regularPrice" | "discountedPrice" | "offerExtraPrice" | "offerSlug" | "inclusions" | "terms">;

export function syncOfferWithPackage(offer: Offer, item: PackageSource): Offer {
  const synced: Offer = {
    ...offer,
    packageId: item.id,
    mainPrice: item.regularPrice,
    discountPrice: item.discountedPrice ?? item.regularPrice,
    inclusions: [...item.inclusions],
    // Shown as: validity (automatic) + universal terms + the package's terms.
    terms: [...item.terms],
    termsMode: "combined",
    applicableCategories: [item.category],
    pricingRule: "fixed_price",
    targets: ["projects"],
  };
  delete synced.benefitValue;
  delete synced.planIds;
  return synced;
}

// Every field syncOfferWithPackage writes; nothing else of the offer comes from the package.
const SYNCED_FIELDS = ["packageId", "mainPrice", "discountPrice", "inclusions", "terms", "termsMode", "applicableCategories", "pricingRule", "targets", "benefitValue", "planIds"] as const;

/** True when the offer's synced copy no longer matches its package. */
export function offerOutOfSync(offer: Offer, item: PackageSource) {
  const synced = syncOfferWithPackage(offer, item);
  return SYNCED_FIELDS.some(key => JSON.stringify(synced[key]) !== JSON.stringify(offer[key]));
}

/** Running = published and not expired. Only a running offer occupies its package. */
export const offerRunning = (offer: Pick<Offer, "status" | "endsAt">, now: number) => offer.status === "published" && Date.parse(offer.endsAt) > now;

/**
 * The running offer that occupies a package, other than `exceptSlug`. A package offer names its
 * package; an older offer occupies the packages linked to it (package.offerSlug).
 */
export function runningOfferForPackage(item: Pick<PackageSource, "id" | "offerSlug">, offers: Offer[], now: number, exceptSlug?: string) {
  return offers.find(offer => offer.slug !== exceptSlug && offerRunning(offer, now)
    && (offer.packageId ? offer.packageId === item.id : !!item.offerSlug && item.offerSlug === offer.slug));
}

export const busyPackageMessage = (item: Pick<PackageSource, "name">, offer: Pick<Offer, "title">) =>
  `"${item.name}" already has a running offer: "${offer.title}". Edit that offer, or let it expire or delete it, before another offer can run on this package.`;

/**
 * Why a package cannot back this package offer, or null. The offer form, the offer save route and
 * the package save route all use it, so every path applies the same rules.
 */
export function packageOfferProblem(offer: Offer, item: PackageSource): string | null {
  if (item.status === "archived") return `"${item.name}" is archived. Choose an available package.`;
  // A fixed offer price plus a hidden extra would show one price and charge another.
  if (item.offerExtraPrice) return `"${item.name}" adds ₹${item.offerExtraPrice.toLocaleString("en-IN")} extra scope to its offer price. Set its extra scope to ₹0 in the package editor; the offer page must show the price the customer pays.`;
  const parsed = offerSchema.safeParse(syncOfferWithPackage(offer, item));
  if (parsed.success) return null;
  // Only what the package decides; the rest of the form (slug, headings…) reports its own errors.
  const issue = parsed.error.issues.find(row => [...SYNCED_FIELDS, "offerPrice"].includes(String(row.path[0]) as never));
  if (!issue) return null;
  if (issue?.message.startsWith("Prices must")) return `The offer price (₹${offer.offerPrice.toLocaleString("en-IN")}) must not be more than the discounted price of "${item.name}" (₹${(item.discountedPrice ?? item.regularPrice).toLocaleString("en-IN")}).`;
  return issue?.message ?? `"${item.name}" does not fit this offer.`;
}
