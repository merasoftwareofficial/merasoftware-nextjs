import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { errorResponse } from "@/lib/api";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, listingSchema, resolvedOffers } from "@/lib/offers";
import { busyPackageMessage, offerRunning, packageOfferProblem, runningOfferForPackage, syncOfferWithPackage } from "@/lib/offer-packages";
import type { QuotedPackage, SalesCatalogue } from "@/lib/sales-packages";
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), offer: offerSchema, creating: z.boolean() }).strict(),
  z.object({ kind: z.literal("terms"), terms: z.array(z.string().trim().min(1).max(1500)).max(50) }).strict(),
  z.object({ kind: z.literal("listing"), listing: listingSchema }).strict(),
]);
export async function PATCH(request: Request) {
  try {
    await requireSalesAdmin();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const data = requestSchema.parse(await request.json());
    if (data.kind === "offer") {
      const settings = await settingsRepo.get();
      const savedOffers = resolvedOffers(settings.offers);
      const saved = savedOffers.find(offer => offer.slug === data.offer.slug);
      const { readSalesCatalogue, salesBackend } = await import("@/lib/sales-catalogue-server");
      let catalogue: SalesCatalogue | null = null;
      const loadCatalogue = async () => catalogue ??= await readSalesCatalogue(true);
      // Package offers (lib/offer-packages.ts): every new offer names its package, the package is
      // fixed after creation, and an offer saved before package offers stays as it was.
      if (data.creating && !data.offer.packageId) return NextResponse.json({ error: "Choose the package this offer is for." }, { status: 400 });
      if (!data.creating && saved?.packageId !== data.offer.packageId) return NextResponse.json({ error: "An offer's package cannot be changed. Create a new offer for the other package." }, { status: 400 });
      let offer = data.offer;
      let source: QuotedPackage | undefined;
      const now = Date.now();
      if (offer.packageId) {
        source = (await loadCatalogue()).packages.find(item => item.id === offer.packageId);
        if (!source) return NextResponse.json({ error: "This offer's package no longer exists in the portal." }, { status: 400 });
        const problem = packageOfferProblem(offer, source);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
        // The package's current values, not whatever an open form last loaded.
        offer = syncOfferWithPackage(offer, source);
        const busy = offerRunning(offer, now) && runningOfferForPackage(source, savedOffers, now, offer.slug);
        if (busy) return NextResponse.json({ error: busyPackageMessage(source, busy) }, { status: 409 });
      }
      const targets = offer.targets || ["projects"];
      if (offer.status === "published" && targets.includes("projects") && (!offer.applicableCategories?.length || !offer.pricingRule)) return NextResponse.json({ error: "Select applicable project categories and a pricing rule before publishing." }, { status: 400 });
      if (offer.status === "published" && targets.includes("projects")) {
        // Categories are portal-owned: each must exist there, and only one already on this saved
        // offer may stay selected after being archived.
        const catalogue = await loadCatalogue();
        const unavailable = (offer.applicableCategories || []).some(key => {
          const category = catalogue.categories?.find(entry => entry.category === key);
          return !category || (category.status === "archived" && !saved?.applicableCategories?.includes(key));
        });
        if (unavailable) return NextResponse.json({ error: "Choose active project categories from the portal before publishing." }, { status: 400 });
      }
      if (offer.status === "published" && targets.includes("service_plans")) {
        if (!offer.planIds?.length || !offer.paymentPolicy || offer.paymentPolicy.mode === "current") return NextResponse.json({ error: "Select service plans and a payment policy before publishing." }, { status: 400 });
        const catalogue = await loadCatalogue();
        const plans = offer.planIds.map(id => catalogue.plans?.find(plan => plan._id === id));
        if (plans.some(plan => !plan) || (offer.paymentPolicy.mode === "limited_uploads" && plans.some(plan => plan?.servicePlan?.capability !== "upload_data"))) return NextResponse.json({ error: "Choose active plans. Limited uploads requires upload-capable plans." }, { status: 400 });
      }
      const exists = !!saved;
      if (data.creating && exists) return NextResponse.json({ error: "An offer already uses this URL slug." }, { status: 409 });
      if (!data.creating && !exists) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
      if (!await settingsRepo.saveOffer(offer, data.creating)) return NextResponse.json({ error: "An offer already uses this URL slug." }, { status: 409 });
      // The backend prices a package from its link (package.offerSlug), through the existing
      // offer-links route. A running offer holds the link; a draft or deleted (archived) offer
      // releases it. An expired offer leaves it alone, so it can never take a package back.
      const linked = source?.offerSlug === offer.slug;
      const link = source && (offerRunning(offer, now) ? !linked : linked && offer.status !== "published");
      if (source && link) {
        try { await salesBackend(true, { offerSlug: offer.slug, packageIds: offerRunning(offer, now) ? [source.id] : [] }, "sales-packages/offer-links"); }
        catch (error) {
          const reason = error instanceof Error ? error.message : "please try again";
          return NextResponse.json(offer, { headers: { "X-Package-Link-Error": encodeURIComponent(`Offer saved, but its package link was not updated (${reason}). Save the offer again to retry.`) } });
        }
      }
      return NextResponse.json(offer);
    }
    if (data.kind === "terms") { await settingsRepo.update({ offerUniversalTerms: data.terms }); return NextResponse.json(data.terms); }
    await settingsRepo.update({ offerListing: data.listing });
    return NextResponse.json(data.listing);
  } catch (error) { return errorResponse(error); }
}
