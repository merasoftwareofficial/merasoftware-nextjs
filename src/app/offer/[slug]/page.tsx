import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers, resolvedTerms, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import { getSessionUser } from "@/lib/auth";
import { offerWithQuote } from "@/lib/offer-quote";
import { phoneCountries } from "@/lib/phone-countries";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const offer = publishedOffers((await settingsRepo.get()).offers).find(item => item.slug === slug);
  return { title: offer?.title ?? "Offer not found", description: offer?.description, robots: { index: false, follow: false } };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const settings = await settingsRepo.get();
  const offer = publishedOffers(settings.offers).find(item => item.slug === slug);
  if (!offer) notFound();
  const quote = offerWithQuote(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS);
  const user = await getSessionUser();
  const enabled = process.env.OFFER_RESERVATIONS_ENABLED === 'true';
  // Only a signed-in owner can be asked for a missing phone, so only then load the country list.
  const countries = enabled && user ? await phoneCountries() : undefined;
  // The card renders the reservation state itself (lib/offer-reservation-rules.ts); remounted per account.
  return <><SiteHeader /><PublicInteraction key={user?._id || 'anonymous'} offer={offer} terms={resolvedTerms(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS)} reservation={enabled ? { slug, quoteKey: quote.quoteKey, signedIn: !!user, serverNow: new Date().toISOString(), countries } : undefined} /></>;
}
