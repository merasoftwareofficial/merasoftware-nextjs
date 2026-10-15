import { notFound, permanentRedirect } from "next/navigation";
import { serviceOffers } from "@/lib/service-offers";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const offer = serviceOffers.find(item => item.slug === slug);
  if (!offer) notFound();
  permanentRedirect(offer.href);
}
