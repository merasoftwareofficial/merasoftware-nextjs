import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicInteraction } from "@/components/campaign/public-interaction/page-content";
import { serviceOffers } from "@/lib/service-offers";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const offer = serviceOffers.find(item => item.slug === slug);
  return { title: offer?.title ?? "Offer not found", description: offer?.description, robots: { index: false, follow: false } };
}
export default async function OfferPage({ params }: Props) {
  const { slug } = await params;
  if (!serviceOffers.some(offer => offer.slug === slug)) notFound();
  switch (slug) {
    case "business-growth": return <PublicInteraction />;
    default: notFound();
  }
}
