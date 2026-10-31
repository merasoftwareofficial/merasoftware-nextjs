import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers } from "@/lib/offers";
import { offerIsRunning } from "@/lib/admin-offers";
import { OfferTargetsPanel } from "./offer-targets-panel";

export const metadata = { title: "Target people — Admin" };
export default async function OfferTargetsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStaffPage(`/admin/offers/targets/${slug}`, "admin");
  try { await requireSalesAdmin(); }
  catch (error) {
    return <main className="admin-main"><AdminHeader eyebrow="OFFERS" title="Offers unavailable" description={error instanceof Error ? error.message : "Admin access is required."} /></main>;
  }
  const offer = resolvedOffers((await settingsRepo.get()).offers).find(row => row.slug === slug);
  if (!offer) return <main className="admin-main"><AdminHeader eyebrow="OFFERS" title="Offer not found" description="This offer no longer exists." action={<Link className="admin-button" href="/admin/offers">All offers</Link>} /></main>;
  const running = offerIsRunning(offer);
  return <main className="admin-main">
    <AdminHeader eyebrow="TARGET PEOPLE" title={offer.title} description="Choose who this offer is for, and follow each person's stage for this offer." action={<Link className="admin-button" href="/admin/offers">All offers</Link>} />
    <OfferTargetsPanel slug={offer.slug} running={running} ended={offer.status === "published" && !running} />
  </main>;
}
