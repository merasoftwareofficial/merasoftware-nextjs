import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requirePortfolioIntegration } from "@/lib/portfolio/integration-auth";
import { settingsRepo } from "@/lib/repo";
import { publishedOffers } from "@/lib/offers";
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
    const offers = publishedOffers(settings.offers)
      .filter(offer => Date.parse(offer.endsAt) > now)
      .map(offer => ({ slug: offer.slug, title: offer.title, endsAt: offer.endsAt }));
    return NextResponse.json({ offers });
  } catch (error) { return errorResponse(error); }
}
