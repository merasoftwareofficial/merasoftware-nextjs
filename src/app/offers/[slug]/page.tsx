import { notFound, permanentRedirect } from "next/navigation";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers } from "@/lib/offers";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = slug === "business-growth" ? "page" : slug;
  if (!publishedOffers((await settingsRepo.get()).offers).some(item => item.slug === target)) notFound();
  permanentRedirect(`/offer/${target}`);
}
