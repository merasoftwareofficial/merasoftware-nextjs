/** Missing facts stay empty until confirmed by the owner. Saved homepage variant content; independent of campaign changes. */
export type TrustContent = {
  phone: string | null; whatsapp: string | null; address: string | null; mapsUrl: string | null; reviewsUrl: string | null;
  stats: { value: string; label: string }[];
  work: { title: string; description: string; image: string; url: string }[];
  testimonials: { name: string; business: string; quote: string }[];
  offer: { title: string; inclusions: string[]; regularPrice: number; offerPrice: number; contactPrice: number; endsAt: string; terms: string; demoDescription: string } | null;
};
export const variantContent: TrustContent = {
  phone: null, whatsapp: null, address: null, mapsUrl: null, reviewsUrl: null,
  stats: [], work: [], testimonials: [], offer: null,
};
