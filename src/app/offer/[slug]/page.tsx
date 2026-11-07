import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers, resolvedTerms, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import { getSessionUser } from "@/lib/auth";
import { offerWithQuote } from "@/lib/offer-quote";
import { phoneCountries } from "@/lib/phone-countries";
import { offerView } from "@/lib/package-design";
import { packagePath, readPublicPackagesOrNone } from "@/lib/package-pages-server";
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
  const user = await getSessionUser();
  // Reservation messages link here (backend emailDefinitions.js offerPageLink). Once an offer is archived,
  // a signed-in customer is sent to My offers, where a reservation of it stays visible.
  if (!offer) { if (user) redirect("/account/offers"); notFound(); }
  // An offer on a package lives on its package page (src/docs/package-offers.md); reservation messages and
  // the sign-in return still use this link, so it keeps working.
  if (offer.packageId && (await readPublicPackagesOrNone()).some(item => item.id === offer.packageId)) redirect(packagePath(offer.packageId));
  const quote = offerWithQuote(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS);
  const enabled = process.env.OFFER_RESERVATIONS_ENABLED === 'true';
  // Only a signed-in owner can be asked for a missing phone, so only then load the country list.
  const countries = enabled && user ? await phoneCountries() : undefined;
  // The card renders the reservation state itself (lib/offer-reservation-rules.ts); remounted per account.
  return <><SiteHeader /><PublicInteraction key={user?._id || 'anonymous'} offer={offerView(offer)} terms={resolvedTerms(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS)} reservation={enabled ? { slug, quoteKey: quote.quoteKey, signedIn: !!user, serverNow: new Date().toISOString(), countries } : undefined} /></>;
}
