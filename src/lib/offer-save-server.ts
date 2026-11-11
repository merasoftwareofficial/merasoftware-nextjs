import "server-only";
import { settingsRepo } from "@/lib/repo";
import { offerSchema, resolvedOffers, type Offer } from "@/lib/offers";
import { busyPackageMessage, offerRunning, offerSlugFor, packageOfferProblem, runningOfferForPackage, syncOfferWithPackage } from "@/lib/offer-packages";
import { OFFER_DESIGN_KEYS } from "@/lib/package-design";
import { readSalesCatalogue, salesBackend } from "@/lib/sales-catalogue-server";
import type { QuotedPackage, SalesCatalogue } from "@/lib/sales-packages";

// Saving one offer: the offers route (offers without a package, edited in Offers) and the package form
// (every offer on a package, src/docs/package-offers.md) both come here, so every path applies the same rules.
export type OfferSaveResult = { ok: true; offer: Offer; linkError?: string } | { ok: false; error: string; status: number };
const refuse = (error: string, status = 400): OfferSaveResult => ({ ok: false, error, status });


export async function saveOfferRecord(input: Offer, creating: boolean, catalogueIn?: SalesCatalogue): Promise<OfferSaveResult> {
  const settings = await settingsRepo.get();
  const savedOffers = resolvedOffers(settings.offers);
  const saved = savedOffers.find(offer => offer.slug === input.slug);
  let catalogue: SalesCatalogue | null = catalogueIn ?? null;
  const loadCatalogue = async () => catalogue ??= await readSalesCatalogue(true);
  // Package offers (lib/offer-packages.ts): every new offer names its package, the package is fixed after
  // creation, and an offer saved before package offers stays as it was.
  if (creating && !input.packageId) return refuse("Choose the package this offer is for.");
  if (!creating && saved?.packageId !== input.packageId) return refuse("An offer's package cannot be changed. Create a new offer for the other package.");
  let offer = input;
  let source: QuotedPackage | undefined;
  const now = Date.now();
  if (offer.packageId) {
    source = (await loadCatalogue()).packages.find(item => item.id === offer.packageId);
    if (!source) return refuse("This offer's package no longer exists in the portal.");
    const problem = packageOfferProblem(offer, source);
    if (problem) return refuse(problem);
    if (source.billing === "monthly" && offer.paymentPolicy?.minimumAdvance) return refuse("Advance token payment is only available for one-time project packages.");
    // The package's current values, not whatever an open form last loaded.
    offer = syncOfferWithPackage(offer, source);
    // A new offer on a package stores no page design: the package owns it (lib/package-design.ts).
    if (creating) for (const key of OFFER_DESIGN_KEYS) delete offer[key];
    const busy = offerRunning(offer, now) && runningOfferForPackage(source, savedOffers, now, offer.slug);
    if (busy) return refuse(busyPackageMessage(source, busy), 409);
  }
  const targets = offer.targets || ["projects"];
  if (offer.paymentPolicy?.minimumAdvance && !targets.includes("projects")) return refuse("Minimum advance payment applies only to project offers.");
  if (offer.status === "published" && targets.includes("projects") && (!offer.applicableCategories?.length || !offer.pricingRule)) return refuse("Select applicable project categories and a pricing rule before publishing.");
  if (offer.status === "published" && targets.includes("projects") && offer.paymentPolicy?.mode === "advance" && !offer.paymentPolicy.minimumAdvance) return refuse("Set the minimum advance payment before publishing.");
  if (offer.status === "published" && targets.includes("projects")) {
    // Categories are portal-owned: each must exist there, and only one already on this saved offer may
    // stay selected after being archived.
    const current = await loadCatalogue();
    const unavailable = (offer.applicableCategories || []).some(key => {
      const category = current.categories?.find(entry => entry.category === key);
      return !category || (category.status === "archived" && !saved?.applicableCategories?.includes(key));
    });
    if (unavailable) return refuse("Choose active project categories from the portal before publishing.");
  }
  if (offer.status === "published" && targets.includes("service_plans")) {
    if (!offer.planIds?.length || !offer.paymentPolicy || offer.paymentPolicy.mode === "current") return refuse("Select service plans and a payment policy before publishing.");
    const current = await loadCatalogue();
    const plans = offer.planIds.map(id => current.plans?.find(plan => plan._id === id));
    if (plans.some(plan => !plan) || (offer.paymentPolicy.mode === "limited_uploads" && plans.some(plan => plan?.servicePlan?.capability !== "upload_data"))) return refuse("Choose active plans. Limited uploads requires upload-capable plans.");
  }
  if (creating && saved) return refuse("An offer already uses this URL slug.", 409);
  if (!creating && !saved) return refuse("Offer not found.", 404);
  if (!await settingsRepo.saveOffer(offer, creating)) return refuse("An offer already uses this URL slug.", 409);
  // The backend prices a package from its link (package.offerSlug), through the existing offer-links route.
  // A running offer holds the link; a draft or deleted (archived) offer releases it. An expired offer leaves
  // it alone, so it can never take a package back.
  const linked = source?.offerSlug === offer.slug;
  const link = source && (offerRunning(offer, now) ? !linked : linked && offer.status !== "published");
  if (source && link) {
    try { await salesBackend(true, { offerSlug: offer.slug, packageIds: offerRunning(offer, now) ? [source.id] : [] }, "sales-packages/offer-links"); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "please try again";
      return { ok: true, offer, linkError: `Offer saved, but its package link was not updated (${reason}). Save again to retry.` };
    }
  }
  return { ok: true, offer };
}

/**
 * A new offer from the package form: it gets its link from its name. A link taken at the same moment moves to
 * the next number (the save only creates when the link is still free).
 */
export async function createPackageOffer(input: Omit<Offer, "slug">, catalogue?: SalesCatalogue): Promise<OfferSaveResult> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const taken = new Set(Object.keys((await settingsRepo.get()).offers ?? {}));
    const parsed = offerSchema.safeParse({ ...input, slug: offerSlugFor(input.title, taken) });
    if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "Check the offer fields.");
    const result = await saveOfferRecord(parsed.data, true, catalogue);
    if (result.ok || result.status !== 409 || result.error !== "An offer already uses this URL slug.") return result;
  }
  return refuse("Could not give this offer a link. Please save again.", 409);
}
