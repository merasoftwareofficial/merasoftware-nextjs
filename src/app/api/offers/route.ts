import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { errorResponse } from "@/lib/api";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, listingSchema } from "@/lib/offers";
import { saveOfferRecord } from "@/lib/offer-save-server";
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
      // Offers are made, edited and published only in the package form (app/api/packages, src/docs/package-offers.md),
      // so its prices, design and link stay in sync. This route keeps editing older offers without a package.
      if (data.creating) return NextResponse.json({ error: "Offers are created in Packages: open a package and press + Add offer." }, { status: 400 });
      const saved = (await settingsRepo.get()).offers?.[data.offer.slug];
      if (data.offer.packageId || saved?.packageId) return NextResponse.json({ error: "This offer belongs to a package. Edit it in Packages." }, { status: 400 });
      const result = await saveOfferRecord(data.offer, false);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result.offer, result.linkError ? { headers: { "X-Package-Link-Error": encodeURIComponent(result.linkError) } } : undefined);
    }
    if (data.kind === "terms") { await settingsRepo.update({ offerUniversalTerms: data.terms }); return NextResponse.json(data.terms); }
    await settingsRepo.update({ offerListing: data.listing });
    return NextResponse.json(data.listing);
  } catch (error) { return errorResponse(error); }
}
