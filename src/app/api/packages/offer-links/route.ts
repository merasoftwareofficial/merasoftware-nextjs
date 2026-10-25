import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { readSalesCatalogue, salesBackend } from "@/lib/sales-catalogue-server";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers } from "@/lib/offers";
import { busyPackageMessage, runningOfferForPackage } from "@/lib/offer-packages";
// The package ticks of an offer saved before package offers; the portal stores them on each
// package (one offer per package). A package offer links its package from its own save instead.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await request.json();
    const offers = resolvedOffers((await settingsRepo.get()).offers);
    const offer = offers.find(row => row.slug === body?.offerSlug);
    if (offer?.packageId) return NextResponse.json({ error: "A package offer is linked to its package automatically." }, { status: 400 });
    if (Array.isArray(body?.packageIds) && body.packageIds.length) {
      const packages = (await readSalesCatalogue(true)).packages;
      for (const id of body.packageIds) {
        const item = packages.find(row => row.id === id);
        // A ticked package no longer moves away from another offer that is still running.
        const busy = item && runningOfferForPackage(item, offers, Date.now(), body.offerSlug);
        if (item && busy) return NextResponse.json({ error: busyPackageMessage(item, busy) }, { status: 409 });
      }
    }
    return NextResponse.json(await salesBackend(true, body, "sales-packages/offer-links"));
  }
  catch (error) { return errorResponse(error); }
}
