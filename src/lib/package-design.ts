import { z } from "zod";
import type { Offer } from "@/lib/offers";
import type { SalesPackage } from "@/lib/sales-packages";

// One package form (src/docs/package-offers.md, owner decisions 7 Nov 2026). A package owns the design of
// its page (/package/<id>); an offer on it adds only what makes it an offer (name, price, expiry, payment
// and reserve rules). The backend checks the same limits (helpers/salesPackages.js validateDesign) and keeps
// the design out of the package quote key, so a design change never asks an open portal form to refresh.

const required = (max: number) => z.string().trim().min(1, "Required.").max(max);
export const contactHrefSchema = z.string().trim().max(500).refine(value => {
  if (/^mailto:[^\s?]+@[^\s?]+(?:\?.*)?$/.test(value)) return true;
  if (/^tel:\+?[\d\s()-]{5,30}$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Use an HTTPS, email (mailto:) or telephone (tel:) link.");
export const packageDesignSchema = z.object({
  eyebrow: required(100),
  heading: required(160),
  headingHighlight: z.string().trim().max(120),
  supportingLine: z.string().trim().max(200),
  subheading: required(160),
  tagline: required(100),
  badge: required(60),
  priceDescription: required(200),
  ctaLabel: required(80),
  contactHref: contactHrefSchema,
}).strict();
export type PackageDesign = z.infer<typeof packageDesignSchema>;
export const DESIGN_KEYS = Object.keys(packageDesignSchema.shape) as (keyof PackageDesign)[];
/** The offer fields that are page design. Offers made on a package never store them (the package does). */
export const OFFER_DESIGN_KEYS = [...DESIGN_KEYS, "description"] as const;

/** A new package's design, and the page of a package saved before page design existed. */
export function defaultPackageDesign(item: Pick<SalesPackage, "name">): PackageDesign {
  return {
    eyebrow: "PRICING & PACKAGES", heading: item.name || "Your package", headingHighlight: "", supportingLine: "",
    subheading: "What's included", tagline: "One-time package", badge: "Package", priceDescription: "One-time payment.",
    ctaLabel: "Enquire about this package", contactHref: "mailto:contact@merasoftware.com",
  };
}

/**
 * A package saved before page design existed takes the design of its last offer that has one (offers saved
 * before 7 Nov 2026 carry their own design), so its page keeps its look after that offer ends. The first
 * save in the package form stores it on the package. No data migration is needed.
 */
export function inheritedDesign(item: Pick<SalesPackage, "name"> & { design?: PackageDesign }, offers: Offer[] = []): PackageDesign | undefined {
  if (item.design) return item.design;
  const source = [...offers].sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt)).find(offer => offer.heading && offer.eyebrow);
  if (!source) return undefined;
  const fallback = defaultPackageDesign(item);
  return Object.fromEntries(DESIGN_KEYS.map(key => [key, source[key] ?? fallback[key]])) as PackageDesign;
}

/** What a page shows: an offer with every design field filled. */
export type OfferView = Offer & PackageDesign & { description: string };
type DesignSource = Pick<SalesPackage, "name" | "description"> & { design?: PackageDesign };

/**
 * The design a page shows: the package's own design, else (offers saved before 7 Nov 2026) the offer's own
 * fields, else the defaults. The description is always the package's when there is a package.
 */
export function offerView(offer: Offer, item?: DesignSource): OfferView {
  const fallback = defaultPackageDesign({ name: item?.name || offer.title });
  const design = Object.fromEntries(DESIGN_KEYS.map(key => [key, item?.design?.[key] ?? offer[key] ?? fallback[key]])) as PackageDesign;
  return { ...offer, ...design, description: item?.description ?? offer.description ?? "" };
}

/**
 * A package page without a running offer, shaped like an offer so one template draws both: main price
 * crossed out, normal price as the price, no countdown (`endsAt` of the last offer or none).
 */
export function packageView(item: DesignSource & Pick<SalesPackage, "id" | "regularPrice" | "discountedPrice" | "inclusions" | "terms" | "order">, last?: Offer): OfferView {
  const normal = item.discountedPrice ?? item.regularPrice;
  const base: Offer = {
    slug: last?.slug ?? "", status: "published", title: item.name, mainPrice: item.regularPrice, discountPrice: normal, offerPrice: normal,
    endsAt: last?.endsAt ?? new Date(0).toISOString(), inclusions: item.inclusions.length ? item.inclusions : ["Included work is confirmed with you."],
    termsMode: "combined", terms: item.terms, order: item.order, packageId: item.id, pricingRule: "fixed_price", targets: ["projects"],
    ...(last?.reservationHoldHours ? { reservationHoldHours: last.reservationHoldHours } : {}),
  };
  return offerView(base, { ...item, design: inheritedDesign(item, last ? [last] : []) });
}
