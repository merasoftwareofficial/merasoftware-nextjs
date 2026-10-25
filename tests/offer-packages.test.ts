import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_OFFER, offerDiscountPercent, offerFinalPrice, offerSchema, type Offer } from "../src/lib/offers";
import { offerOutOfSync, offerRunning, packageOfferProblem, runningOfferForPackage, syncOfferWithPackage, type PackageSource } from "../src/lib/offer-packages";

const NOW = Date.parse("2026-10-25T12:00:00+05:30");
const FUTURE = "2026-11-02T23:59:59+05:30";
const PAST = "2026-10-20T23:59:59+05:30";
const pkg: PackageSource = {
  id: "all-in-one", name: "All-in-One Startup", category: "standard_websites", status: "published",
  regularPrice: 25000, discountedPrice: 20000, offerExtraPrice: 0, offerSlug: "",
  inclusions: ["5-page website", "Hosting for 1 year"], terms: ["Domain is registered in the client's name."],
};
const legacy: Offer = { ...DEFAULT_OFFER, endsAt: FUTURE };
const packageOffer = (patch: Partial<Offer> = {}): Offer => syncOfferWithPackage({ ...DEFAULT_OFFER, slug: "mega", title: "Mega offer", offerPrice: 2099, endsAt: FUTURE, ...patch }, pkg);

test("sync copies only package-owned fields and keeps the offer's own price and design", () => {
  const offer = packageOffer({ heading: "Own heading", benefitValue: 10, planIds: ["a".repeat(24)] });
  assert.equal(offer.packageId, "all-in-one");
  assert.equal(offer.mainPrice, 25000);
  assert.equal(offer.discountPrice, 20000);
  assert.deepEqual(offer.inclusions, pkg.inclusions);
  assert.deepEqual(offer.terms, pkg.terms);
  assert.equal(offer.termsMode, "combined");
  assert.deepEqual(offer.applicableCategories, ["standard_websites"]);
  assert.equal(offer.pricingRule, "fixed_price");
  assert.deepEqual(offer.targets, ["projects"]);
  assert.equal("benefitValue" in offer, false);
  assert.equal("planIds" in offer, false);
  assert.equal(offer.offerPrice, 2099);
  assert.equal(offer.heading, "Own heading");
  assert.equal(offerSchema.safeParse(offer).success, true);
  assert.equal(offerOutOfSync(offer, pkg), false);
  assert.equal(offerOutOfSync(offer, { ...pkg, inclusions: [...pkg.inclusions, "Logo"] }), true);
  assert.equal(offerOutOfSync(offer, { ...pkg, regularPrice: 30000 }), true);
});

test("percent badge uses the main price and never rounds up", () => {
  assert.equal(offerDiscountPercent({ mainPrice: 25000, offerPrice: 2099 }), 91); // 91.6
  assert.equal(offerDiscountPercent({ mainPrice: 1000, offerPrice: 100 }), 90);
  assert.equal(offerDiscountPercent({ mainPrice: 0, offerPrice: 0 }), 0);
  assert.equal(offerDiscountPercent({ mainPrice: 500, offerPrice: 500 }), 0);
});

test("one price formula: fixed price adds a package extra, discounts start from the main price", () => {
  assert.equal(offerFinalPrice(10000, { pricingRule: "fixed_price", offerPrice: 699 }, 2000), 2699);
  assert.equal(offerFinalPrice(10000, { pricingRule: "fixed_discount", offerPrice: 0, benefitValue: 3000 }, 2000), 7000);
  assert.equal(offerFinalPrice(10000, { pricingRule: "percentage", offerPrice: 0, benefitValue: 40 }), 6000);
  assert.equal(offerFinalPrice(3333.33, { pricingRule: "percentage", offerPrice: 0, benefitValue: 33.33 }), 2222.33);
});

test("package rules: archived, extra scope and an offer price above the discounted price are refused", () => {
  const offer = packageOffer();
  assert.equal(packageOfferProblem(offer, pkg), null);
  assert.match(packageOfferProblem(offer, { ...pkg, status: "archived" }) ?? "", /archived/);
  assert.match(packageOfferProblem(offer, { ...pkg, offerExtraPrice: 2000 }) ?? "", /extra scope/);
  assert.match(packageOfferProblem(offer, { ...pkg, discountedPrice: 2000, regularPrice: 2500 }) ?? "", /must not be more than the discounted price/);
  // Form errors that have nothing to do with the package are not reported as package problems.
  assert.equal(packageOfferProblem({ ...offer, slug: "" as string }, pkg), null);
});

test("a package has one running offer; drafts, expired and archived offers do not occupy it", () => {
  const running = packageOffer({ status: "published" });
  assert.equal(offerRunning(running, NOW), true);
  assert.equal(runningOfferForPackage(pkg, [running], NOW)?.slug, "mega");
  assert.equal(runningOfferForPackage(pkg, [running], NOW, "mega"), undefined, "an offer does not block itself");
  for (const other of [{ status: "draft" as const }, { status: "archived" as const }, { status: "published" as const, endsAt: PAST }]) {
    assert.equal(runningOfferForPackage(pkg, [packageOffer(other)], NOW), undefined, JSON.stringify(other));
  }
  assert.equal(runningOfferForPackage({ ...pkg, id: "other" }, [running], NOW), undefined);
  // An older offer occupies the packages linked to it.
  assert.equal(runningOfferForPackage({ ...pkg, offerSlug: "page" }, [legacy], NOW)?.slug, "page");
  assert.equal(runningOfferForPackage(pkg, [legacy], NOW), undefined);
});

test("older offers are untouched: parsing adds no package field and keeps their content", () => {
  const parsed = offerSchema.parse(legacy);
  assert.equal("packageId" in parsed, false);
  assert.equal(JSON.stringify(parsed), JSON.stringify(offerSchema.parse(JSON.parse(JSON.stringify(legacy)))));
  // A package offer must use a fixed offer price.
  assert.equal(offerSchema.safeParse({ ...packageOffer(), pricingRule: "percentage", benefitValue: 10, offerPrice: 22500 }).success, false);
});

test("package IDs follow the backend rule, and package-sized lists fit an offer", () => {
  for (const packageId of ["new", "preview", "plus-2"]) assert.equal(offerSchema.safeParse({ ...packageOffer(), packageId }).success, true, packageId);
  for (const packageId of ["Plus", "a.b", "constructor"]) assert.equal(offerSchema.safeParse({ ...packageOffer(), packageId }).success, false, packageId);
  const long = Array.from({ length: 50 }, (_, index) => `${index} ${"x".repeat(1400)}`);
  assert.equal(offerSchema.safeParse(syncOfferWithPackage(packageOffer(), { ...pkg, inclusions: long })).success, true);
  assert.equal(offerSchema.safeParse(syncOfferWithPackage(packageOffer(), { ...pkg, inclusions: [...long, "51"] })).success, false);
});
