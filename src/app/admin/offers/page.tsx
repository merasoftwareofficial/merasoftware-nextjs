import Link from "@/components/link";
import { AdminHeader } from "@/components/admin-layout";
import { requireStaffPage } from "@/lib/auth";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, DEFAULT_UNIVERSAL_TERMS, DEFAULT_OFFER_LISTING } from "@/lib/offers";
import { OFFER_SECTIONS, offerSection } from "@/lib/admin-offers";
import { OffersManager } from "./offers-manager";
import s from "./offers-manager.module.css";

export const metadata = { title: "Offers — Admin" };
export default async function OffersPage({ searchParams }: { searchParams: Promise<{ section?: string; offer?: string; new?: string }> }) {
  await requireStaffPage("/admin/offers", "admin");
  try { await requireSalesAdmin(); }
  catch (error) {
    return <main className="admin-main"><AdminHeader eyebrow="OFFERS" title="Offers unavailable" description={error instanceof Error ? error.message : "Admin access is required."} /></main>;
  }
  const query = await searchParams;
  const section = offerSection(query.section);
  const settings = await settingsRepo.get();
  const offers = resolvedOffers(settings.offers);
  return <main className="admin-main">
    <AdminHeader eyebrow="OFFERS" title="Offer management" description="Manage your offers, their agreed rules, public content and terms in one place." action={<Link className="admin-button" href="/offer" target="_blank" rel="noreferrer">View public offers ↗</Link>} />
    <nav className={s.tabs} aria-label="Offer management sections">{OFFER_SECTIONS.map(item => <Link key={item.id} href={`/admin/offers?section=${item.id}`} aria-current={section === item.id ? "page" : undefined}>{item.label}</Link>)}</nav>
    <div className={s.actions}><Link className="admin-action" href="/admin/packages">Manage linked packages →</Link></div>
    <p className="admin-subtitle">{OFFER_SECTIONS.find(item => item.id === section)!.description}</p>
    <OffersManager key={`${section}:${query.offer || ""}:${query.new || ""}`} section={section} initialOfferSlug={query.offer} createNew={section === "settings" && query.new === "1"} initialOffers={offers} initialTerms={settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS} initialListing={settings.offerListing ?? DEFAULT_OFFER_LISTING} />
  </main>;
}
