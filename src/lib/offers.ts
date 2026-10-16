import { formatIndiaDateTime } from "@/lib/date-time";
import { z } from "zod";
import { starterOffer } from "@/components/campaign/public-interaction/offer-content";

const short = (max = 200) => z.string().trim().min(1).max(max);
export const offerSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.").max(80)
  .refine(value => !["new", "preview", "__proto__", "constructor", "prototype"].includes(value), "Choose another URL slug.");
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
  mainPrice: z.number().finite().min(0).max(10000000),
  discountPrice: z.number().finite().min(0).max(10000000),
  offerPrice: z.number().finite().min(0).max(10000000),
  priceDescription: short(200),
  endsAt: z.string().datetime({ offset: true }),
  inclusions: z.array(short(300)).min(1).max(30),
  termsMode: z.enum(["universal", "offer", "combined"]),
  terms: z.array(short(1500)).max(50),
  ctaLabel: short(80),
  contactHref: z.string().trim().max(500).refine(value => {
    if (/^mailto:[^\s?]+@[^\s?]+(?:\?.*)?$/.test(value)) return true;
    if (/^tel:\+?[\d\s()-]{5,30}$/.test(value)) return true;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }, "Use an HTTPS, email (mailto:) or telephone (tel:) link."),
  order: z.number().int().min(0).max(9999),
}).strict().refine(value => value.mainPrice >= value.discountPrice && value.discountPrice >= value.offerPrice, {
  message: "Prices must follow main price ≥ normal discount price ≥ offer price.", path: ["offerPrice"],
});
export type Offer = z.infer<typeof offerSchema>;
export const DEFAULT_OFFER: Offer = {
  slug: "page", status: "published", ...starterOffer,
  eyebrow: "YOUR BUSINESS, ONLINE", heading: "Get your business", headingHighlight: "noticed online.",
  supportingLine: "One team to help you take the next step.", badge: "Starter offer",
  termsMode: "combined", terms: starterOffer.terms.offer.filter(term => !term.startsWith("Offer valid until")),
  ctaLabel: "Enquire about this offer", contactHref: "mailto:contact@merasoftware.com", order: 0,
};
export const DEFAULT_UNIVERSAL_TERMS = starterOffer.terms.universal;
export const listingSchema = z.object({ title: short(120), emptyMessage: short(300) }).strict();
export type OfferListing = z.infer<typeof listingSchema>;
export const DEFAULT_OFFER_LISTING: OfferListing = { title: "Offers", emptyMessage: "No offers available right now. Please check back soon." };
export function resolvedOffers(saved?: Record<string, Offer>): Offer[] {
  const merged = { page: DEFAULT_OFFER, ...saved };
  return Object.values(merged).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
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
