import "server-only";
import { settingsRepo } from "@/lib/repo";
import { resolvedOffers, type Offer } from "@/lib/offers";

const matchesPackage = (offer: Offer, packageId: string, offerSlug = "") => offer.packageId === packageId || (!!offerSlug && offer.slug === offerSlug);

/** End active package offers before hiding or deleting their package. The saved
 * originals let the caller compensate if the portal command then fails. */
export async function archiveRunningPackageOffers(packageId: string, offerSlug = ""): Promise<Offer[]> {
  const offers = resolvedOffers((await settingsRepo.get()).offers);
  const running = offers.filter(offer => offer.status === "published" && matchesPackage(offer, packageId, offerSlug));
  const changed: Offer[] = [];
  try {
    for (const offer of running) {
      if (!await settingsRepo.saveOffer({ ...offer, status: "archived" }, false)) throw new Error(`Could not end offer "${offer.title}".`);
      changed.push(offer);
    }
    return changed;
  } catch (error) {
    await restorePackageOffers(changed);
    throw error;
  }
}

export async function restorePackageOffers(offers: Offer[]) {
  for (const offer of offers) await settingsRepo.saveOffer(offer, false);
}
