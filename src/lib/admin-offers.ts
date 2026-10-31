import type { Offer } from "./offers";

export const OFFER_SECTIONS = [
  { id: "details", label: "All Offers", description: "Browse active, expired, draft and archived offers." },
  { id: "settings", label: "Offer Settings", description: "Choose an offer to manage its pricing, applicability, payment settings and content." },
  { id: "listing", label: "Content & Preview", description: "Manage the public listing and preview your offer cards." },
  { id: "terms", label: "Terms & Conditions", description: "Manage common terms. Offer-specific terms are edited in Offer Settings." },
] as const;
export type OfferSection = typeof OFFER_SECTIONS[number]["id"];
export function offerSection(value?: string): OfferSection {
  return OFFER_SECTIONS.find(section => section.id === value)?.id ?? "details";
}
export function legacyOfferDestination(section?: string) {
  return `/admin/offers?section=${offerSection(section)}`;
}
export type OfferState = Offer["status"] | "active" | "expired";
export const offerIsRunning = (offer: Offer) => offerState(offer, Date.now()) === "active";
export function offerState(offer: Offer, now: number | null): OfferState {
  if (offer.status !== "published") return offer.status;
  if (now === null) return "published";
  const end = Date.parse(offer.endsAt);
  return !Number.isFinite(end) || end <= now ? "expired" : "active";
}
