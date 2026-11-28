import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateBackendOffersCache, readSalesCatalogue, requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { invalidatePublicPages } from "@/lib/public-cache";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { errorResponse } from "@/lib/api";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, offerSlugSchema, packageIdSchema, listingSchema } from "@/lib/offers";
import { saveOfferRecord } from "@/lib/offer-save-server";
const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("offer"), offer: offerSchema, creating: z.boolean() }).strict(),
  z.object({ kind: z.literal("terms"), terms: z.array(z.string().trim().min(1).max(1500)).max(50) }).strict(),
  z.object({ kind: z.literal("listing"), listing: listingSchema }).strict(),
]);
const deleteOfferSchema = z.object({
  slug: offerSlugSchema,
  packageId: packageIdSchema.optional(),
}).strict();
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
    if (data.kind === "terms") { await settingsRepo.update({ offerUniversalTerms: data.terms }); invalidatePublicPages(); void invalidateBackendOffersCache(); return NextResponse.json(data.terms); }
    await settingsRepo.update({ offerListing: data.listing });
    invalidatePublicPages();
    return NextResponse.json(data.listing);
  } catch (error) { return errorResponse(error); }
}

// Archive (soft-delete) a package offer and unlink it from its package + draft, OR unlink a legacy
// (non-packageId) offer from a single package without affecting other packages.
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const parsed = deleteOfferSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid offer." }, { status: 400 });
    const { slug, packageId } = parsed.data;
    const saved = (await settingsRepo.get()).offers?.[slug];
    if (!saved) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    if (saved.packageId) {
      const result = await saveOfferRecord({ ...saved, status: "archived" }, false);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      let draftCleared = false;
      try {
        const draftRes = await salesBackend(true, { action: "clearOffer", packageId: saved.packageId, offerSlug: saved.slug }, "sales-packages/drafts") as { cleared?: boolean };
        draftCleared = Boolean(draftRes?.cleared);
      } catch { /* Non-fatal: draft may not exist or may not hold this offer. */ }
      return NextResponse.json({
        offer: result.offer,
        draftCleared,
        ...(result.linkError ? { linkError: result.linkError } : {}),
      });
    }
    if (!packageId) return NextResponse.json({ error: "Choose the package to unlink this offer from." }, { status: 400 });
    const catalogue = await readSalesCatalogue(true);
    const remaining = catalogue.packages.filter(row => row.offerSlug === saved.slug && row.id !== packageId).map(row => row.id);
    await salesBackend(true, { offerSlug: saved.slug, packageIds: remaining }, "sales-packages/offer-links");
    invalidatePublicPages(`/package/${packageId}`, `/offer/${saved.slug}`, `/offers/${saved.slug}`);
    return NextResponse.json({ unlinked: true, offerSlug: saved.slug, packageId });
  } catch (error) { return errorResponse(error); }
}
