import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requirePortfolioIntegration } from "@/lib/portfolio/integration-auth";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, resolvedTerms, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import { createHash } from "node:crypto";
export const runtime = "nodejs";

// Live offers for the client portal's "Create Project" form, which lets an admin attach a
// project to the offer it was sold under. Same server-to-server auth as the portfolio
// integration. Only published offers that have not yet expired are returned — an expired or
// unpublished offer cannot be attached to new work.
export async function GET(request: Request) {
  try {
    requirePortfolioIntegration(request);
    const settings = await settingsRepo.get();
    const now = Date.now();
    const catalogueOffers = resolvedOffers(settings.offers).map(offer => {
      const value = { ...offer, resolvedTerms: resolvedTerms(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS) };
      return { ...value, quoteKey: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
    });
    const offers = catalogueOffers.filter(offer => offer.status === "published" && Date.parse(offer.endsAt) > now);
    return NextResponse.json({ offers, catalogueOffers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
