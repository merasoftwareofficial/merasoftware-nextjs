import { formatIndiaDateTime } from "@/lib/date-time";
import { z } from "zod";
import { starterOffer } from "@/components/campaign/public-interaction/offer-content";
import { PROJECT_CATEGORY_KEY } from "@/lib/sales-packages";

const short = (max = 200) => z.string().trim().min(1).max(max);
export const paymentPolicySchema = z.object({
  mode: z.enum(["current", "advance", "limited_uploads", "pay_later"]),
  uploadAllowance: z.number().int().min(0).max(10000),
  dueDays: z.number().int().min(0).max(365),
  cycleScope: z.enum(["first_purchase", "every_cycle"]),
  reminderOffsets: z.array(z.number().int().min(-365).max(365)).max(10),
}).strict().refine(value => value.mode !== "limited_uploads" || value.uploadAllowance > 0, { message: "Allow at least one upload before payment.", path: ["uploadAllowance"] });
export const offerSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.").max(80)
  .refine(value => !["new", "preview", "__proto__", "constructor", "prototype"].includes(value), "Choose another URL slug.");
// The backend's package ID rule (helpers/salesPackages.js safeId), not the offer slug rule.
export const packageIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).refine(value => !["constructor", "prototype", "__proto__"].includes(value));
export const offerSchema = z.object({
  slug: offerSlugSchema,
  status: z.enum(["draft", "published", "archived"]),
  title: short(120),
  eyebrow: short(100),
  heading: short(160),
  headingHighlight: z.string().trim().max(120),
  description: short(300),
  supportingLine: z.string().trim().max(200),
  subheading: short(160),
  tagline: short(100),
  badge: short(60),
  mainPrice: z.number().finite().min(0).max(10000000).multipleOf(0.01),
  discountPrice: z.number().finite().min(0).max(10000000).multipleOf(0.01),
  offerPrice: z.number().finite().min(0).max(10000000).multipleOf(0.01),
  priceDescription: short(200),
  endsAt: z.string().datetime({ offset: true }),
  // Same limits as a package's included work (backend validatePackage), so a package always fits its offer.
  inclusions: z.array(short(1500)).min(1).max(50),
  termsMode: z.enum(["universal", "offer", "combined"]),
  terms: z.array(short(1500)).max(50),
  ctaLabel: short(80),
  contactHref: z.string().trim().max(500).refine(value => {
    if (/^mailto:[^\s?]+@[^\s?]+(?:\?.*)?$/.test(value)) return true;
    if (/^tel:\+?[\d\s()-]{5,30}$/.test(value)) return true;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use an HTTPS, email (mailto:) or telephone (tel:) link."),
  order: z.number().int().min(0).max(9999),
  // Portal-owned category keys (lib/sales-packages.ts); the publish route checks they exist and are active.
  applicableCategories: z.array(z.string().regex(PROJECT_CATEGORY_KEY)).min(1).max(100).refine(keys => new Set(keys).size === keys.length, "Select each category once.").optional(),
  packageIds: z.array(offerSlugSchema).max(100).optional(),
  pricingRule: z.enum(["fixed_price", "fixed_discount", "percentage"]).optional(),
  benefitValue: z.number().finite().min(0).max(10000000).optional(),
  targets: z.array(z.enum(["projects", "service_plans"])).min(1).max(2).optional(),
  planIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).optional(),
  paymentPolicy: paymentPolicySchema.optional(),
  // A package offer (lib/offer-packages.ts): its two struck prices, included work and terms come from
  // this package. Set at creation and fixed after. Offers saved before this field keep working unchanged.
  packageId: packageIdSchema.optional(),
}).strict().refine(value => value.mainPrice >= value.discountPrice && value.discountPrice >= value.offerPrice, {
  message: "Prices must follow main price ≥ normal discount price ≥ offer price.", path: ["offerPrice"],
}).refine(value => value.pricingRule !== "percentage" || (value.benefitValue !== undefined && value.benefitValue <= 100), { message: "Percentage benefit must be between 0 and 100.", path: ["benefitValue"] })
  .refine(value => value.pricingRule !== "fixed_discount" || value.benefitValue !== undefined, { message: "Enter the fixed discount amount.", path: ["benefitValue"] })
  .refine(value => {
    if (!value.pricingRule || value.pricingRule === "fixed_price") return true;
    return Math.round(offerFinalPrice(value.mainPrice, value) * 100) === Math.round(value.offerPrice * 100);
  }, { message: "Offer display price must match the configured discount rule.", path: ["offerPrice"] })
  .refine(value => !value.packageId || value.pricingRule === "fixed_price", { message: "A package offer uses a fixed offer price.", path: ["pricingRule"] });
export type Offer = z.infer<typeof offerSchema>;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
/**
 * The price a customer pays under an offer: the website copy of the backend's calculateBenefit
 * (backend helpers/salesPackages.js), which stays the authority for real quotes. `extra` is a
 * package's extra scope, added only to a fixed offer price.
 */
export function offerFinalPrice(regularPrice: number, offer: { pricingRule?: "fixed_price" | "fixed_discount" | "percentage"; offerPrice: number; benefitValue?: number }, extra = 0): number {
  if (offer.pricingRule === "fixed_price") return money(offer.offerPrice + extra);
  if (offer.pricingRule === "fixed_discount") return money(regularPrice - Number(offer.benefitValue));
  if (offer.pricingRule === "percentage") return money(regularPrice * (1 - Number(offer.benefitValue) / 100));
  return money(offer.offerPrice);
}
/** Whole-percent saving against the main (first struck) price, rounded down so it never overstates. */
export function offerDiscountPercent(offer: Pick<Offer, "mainPrice" | "offerPrice">) {
  if (!(offer.mainPrice > 0) || offer.offerPrice >= offer.mainPrice) return 0;
  return Math.floor((offer.mainPrice - offer.offerPrice) / offer.mainPrice * 100 + 1e-9);
}
export const DEFAULT_OFFER: Offer = {
  slug: "page", status: "published", ...starterOffer,
  eyebrow: "YOUR BUSINESS, ONLINE", heading: "Get your business", headingHighlight: "noticed online.",
  supportingLine: "One team to help you take the next step.", badge: "Starter offer",
  termsMode: "combined", terms: starterOffer.terms.offer.filter(term => !term.startsWith("Offer valid until")),
  ctaLabel: "Enquire about this offer", contactHref: "mailto:contact@merasoftware.com", order: 0,
  applicableCategories: ["standard_websites"], packageIds: [], pricingRule: "fixed_price",
};
export const DEFAULT_UNIVERSAL_TERMS = starterOffer.terms.universal;
export const listingSchema = z.object({ title: short(120), emptyMessage: short(300) }).strict();
export type OfferListing = z.infer<typeof listingSchema>;
export const DEFAULT_OFFER_LISTING: OfferListing = { title: "Offers", emptyMessage: "No offers available right now. Please check back soon." };
export function resolvedOffers(saved?: Record<string, Offer>): Offer[] {
  // Only offers an admin saved exist; DEFAULT_OFFER is just the new-offer form template.
  return Object.values(saved ?? {}).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
export function publishedOffers(saved?: Record<string, Offer>) {
  return resolvedOffers(saved).filter(offer => offer.status === "published");
}
export function resolvedTerms(offer: Offer, universal: string[]) {
  const validity = `Offer valid until ${formatIndiaDateTime(offer.endsAt, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}.`;
  return [...new Set([
    validity,
    ...(offer.termsMode !== "offer" ? universal : []),
    ...(offer.termsMode !== "universal" ? offer.terms : []),
  ])];
}
