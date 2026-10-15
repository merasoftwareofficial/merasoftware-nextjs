import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers, resolvedTerms, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
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
  return <><SiteHeader /><PublicInteraction offer={offer} terms={resolvedTerms(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS)} /></>;
}
