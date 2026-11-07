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
      // One save path for every offer (lib/offer-save-server.ts). Offers on a package are made and edited in
      // the package form (app/api/packages); this route keeps editing offers and the package offer list.
      const result = await saveOfferRecord(data.offer, data.creating);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(result.offer, result.linkError ? { headers: { "X-Package-Link-Error": encodeURIComponent(result.linkError) } } : undefined);
    }
    if (data.kind === "terms") { await settingsRepo.update({ offerUniversalTerms: data.terms }); return NextResponse.json(data.terms); }
    await settingsRepo.update({ offerListing: data.listing });
    return NextResponse.json(data.listing);
  } catch (error) { return errorResponse(error); }
}
