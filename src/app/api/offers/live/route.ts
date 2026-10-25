import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requirePortfolioIntegration } from "@/lib/portfolio/integration-auth";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, DEFAULT_UNIVERSAL_TERMS } from "@/lib/offers";
import { resolvedPackagePages } from "@/lib/package-pages";
import { offerWithQuote } from "@/lib/offer-quote";
export const runtime = "nodejs";

// Live offers for the client portal's "Create Project" form, which lets an admin attach a
// project to the offer it was sold under. Same server-to-server auth as the portfolio
// integration. Only published offers that have not yet expired are returned — an expired or
// unpublished offer cannot be attached to new work. It also lists the package pages, the only
// pages the portal accepts on a package (lib/package-pages.ts).
export async function GET(request: Request) {
  try {
    requirePortfolioIntegration(request);
    const settings = await settingsRepo.get();
    const now = Date.now();
    const catalogueOffers = resolvedOffers(settings.offers).map(offer => offerWithQuote(offer, settings.offerUniversalTerms ?? DEFAULT_UNIVERSAL_TERMS));
    const offers = catalogueOffers.filter(offer => offer.status === "published" && Date.parse(offer.endsAt) > now);
    const packagePages = resolvedPackagePages(settings.packagePages).map(({ slug, title }) => ({ slug, title }));
    return NextResponse.json({ offers, catalogueOffers, packagePages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
