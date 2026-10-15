export type OfferTerms = {
  mode: "universal" | "offer" | "combined";
  universal: string[];
  offer: string[];
};

/** Current offer configuration; the countdown uses this fixed deadline. */
export const starterOffer = {
  title: "Business Growth Starter",
  tagline: "YOUR FIRST STEP ONLINE",
  subheading: "Build your online presence.",
  description: "Websites. Google visibility. Social media.",
  mainPrice: 10000,
  discountPrice: 4000,
  offerPrice: 699,
  priceDescription: "One-time starter setup for your business.",
  endsAt: "2026-10-20T23:59:59+05:30",
  inclusions: [
    "A single-page business website with a contact enquiry link",
    "Google Business Profile setup or optimisation",
    "Facebook and Instagram business profile setup",
    "WhatsApp Business profile and contact-link setup",
    "One branded social post design to introduce your business",
  ],
  terms: {
    mode: "combined",
    universal: [
      "Scope, delivery timeline and applicable taxes are confirmed before payment.",
      "You provide your business details, logo, photos and required account access.",
      "Domain, hosting, advertising spend and ongoing management are separate unless agreed in writing.",
    ],
    offer: [
      "Offer valid until 20 October 2026, 11:59 PM IST.",
      "The starter includes one setup and one social post design; ongoing content and campaigns are separate.",
      "Google profile verification and visibility depend on Google's approval; rankings are not guaranteed.",
    ],
  } satisfies OfferTerms,
};

export function resolveOfferTerms(terms: OfferTerms) {
  return [...new Set([
    ...(terms.mode !== "offer" ? terms.universal : []),
    ...(terms.mode !== "universal" ? terms.offer : []),
  ])];
}
