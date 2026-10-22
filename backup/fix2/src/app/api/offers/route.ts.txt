import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { errorResponse } from "@/lib/api";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, listingSchema, resolvedOffers } from "@/lib/offers";
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
      if (data.offer.status === "published" && (!data.offer.applicableCategories?.length || !data.offer.pricingRule)) return NextResponse.json({ error: "Select applicable project categories and a pricing rule before publishing." }, { status: 400 });
      const settings = await settingsRepo.get();
      const exists = resolvedOffers(settings.offers).some(offer => offer.slug === data.offer.slug);
      if (data.creating && exists) return NextResponse.json({ error: "An offer already uses this URL slug." }, { status: 409 });
      if (!data.creating && !exists) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
      if (!await settingsRepo.saveOffer(data.offer, data.creating)) return NextResponse.json({ error: "An offer already uses this URL slug." }, { status: 409 });
      return NextResponse.json(data.offer);
    }
    if (data.kind === "terms") { await settingsRepo.update({ offerUniversalTerms: data.terms }); return NextResponse.json(data.terms); }
    await settingsRepo.update({ offerListing: data.listing });
    return NextResponse.json(data.listing);
  } catch (error) { return errorResponse(error); }
}
