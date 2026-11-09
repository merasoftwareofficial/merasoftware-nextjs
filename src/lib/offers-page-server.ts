import "server-only";
import { cache } from "react";
import { settingsRepo } from "@/lib/repo";
import { DEFAULT_OFFER_LISTING, resolvedOffers } from "@/lib/offers";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import { offerCards } from "@/lib/offers-page";

/**
 * Everything the /offers page needs (lib/offers-page.ts). `catalogue` is null while the sales backend is
 * unreachable: no stale or made-up prices then. The heading and empty message are the admin's
 * Offers listing settings (admin Offers tab).
 */
export const readOffersPage = cache(async () => {
  const settings = await settingsRepo.get();
  const listing = settings.offerListing ?? DEFAULT_OFFER_LISTING;
  let catalogue;
  try { catalogue = await readSalesCatalogue(); } catch { return { listing, catalogue: null, cards: [] }; }
  const packages = catalogue.packages.filter(item => item.status === "published");
  return { listing, catalogue, cards: offerCards(packages, resolvedOffers(settings.offers), Date.now()) };
});
