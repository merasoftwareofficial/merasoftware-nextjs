import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { readSalesCatalogue, salesBackend } from "@/lib/sales-catalogue-server";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers } from "@/lib/offers";
import { busyPackageMessage, offerOutOfSync, packageOfferProblem, runningOfferForPackage, syncOfferWithPackage, type PackageSource } from "@/lib/offer-packages";
export async function GET() {
  try { return NextResponse.json(await readSalesCatalogue(true), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
// Package save. A package owns its offer's struck prices, included work and terms
// (lib/offer-packages.ts), so a change is checked against the package's running offer first and
// copied to its package offers after the portal saved it.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    const item = body?.item as PackageSource | undefined;
    if (!item || typeof item.id !== "string") return NextResponse.json(await salesBackend(true, body));
    const offers = resolvedOffers((await settingsRepo.get()).offers);
    const previous = body.creating ? undefined : (await readSalesCatalogue(true)).packages.find(row => row.id === item.id);
    const running = runningOfferForPackage({ id: item.id, offerSlug: previous?.offerSlug ?? "" }, offers, Date.now());
    if (running) {
      if (running.packageId && previous?.offerSlug !== running.slug) return NextResponse.json({ error: `The running offer "${running.title}" is not linked to this package yet. Open that offer and save it again, then edit the package.` }, { status: 409 });
      if (item.status === "archived" || item.offerSlug !== running.slug) return NextResponse.json({ error: `${busyPackageMessage(item, running)} A package with a running offer cannot be archived, moved to another category or linked to another offer.` }, { status: 409 });
      const problem = running.packageId ? packageOfferProblem(running, item) : null;
      if (problem) return NextResponse.json({ error: `This change does not fit the running offer "${running.title}": ${problem}` }, { status: 400 });
    }
    // A package offer is linked only from its own offer form.
    const target = item.offerSlug ? offers.find(offer => offer.slug === item.offerSlug) : undefined;
    if (target?.packageId && target.packageId !== item.id) return NextResponse.json({ error: `"${target.title}" is the offer of another package. Create a new offer for this package instead.` }, { status: 400 });
    const saved = await salesBackend(true, body) as PackageSource;
    // Drafts follow their package too, so they open with current values; one that no longer fits
    // (e.g. its offer price is now above the package price) keeps its values until it is edited.
    const failed: string[] = [];
    for (const offer of offers.filter(row => row.packageId === saved.id && offerOutOfSync(row, saved))) {
      if (packageOfferProblem(offer, saved)) { failed.push(offer.title); continue; }
      try { await settingsRepo.saveOffer(syncOfferWithPackage(offer, saved), false); }
      catch { failed.push(offer.title); }
    }
    return NextResponse.json(saved, failed.length ? { headers: { "X-Offer-Sync-Failed": encodeURIComponent(failed.join(", ")) } } : undefined);
  }
  catch (error) { return errorResponse(error); }
}
