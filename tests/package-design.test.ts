// One package form (src/docs/package-offers.md, owner decisions 7 Nov 2026): the package owns its page design,
// a page without an offer shows 2 prices, and offers made on a package store no design of their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OFFER, offerSchema, type Offer } from "@/lib/offers";
import { defaultPackageDesign, inheritedDesign, offerView, packageDesignSchema, packageView, OFFER_DESIGN_KEYS, type PackageDesign } from "@/lib/package-design";
import { syncOfferWithPackage } from "@/lib/offer-packages";

const design: PackageDesign = { eyebrow: "YOUR BUSINESS, ONLINE", heading: "Get your business", headingHighlight: "noticed online.", supportingLine: "",
  subheading: "What's included", tagline: "One-time package", badge: "Most chosen", priceDescription: "One-time payment.",
  ctaLabel: "Enquire about this package", contactHref: "mailto:contact@merasoftware.com" };
const pkg = { id: "business-starter", name: "Business Starter", description: "A business website.", category: "standard_websites", status: "published" as const,
  regularPrice: 15000, discountedPrice: 9999, offerExtraPrice: 0, offerSlug: "", inclusions: ["Website"], terms: ["Hosting extra"], order: 2, design };
const withoutDesign = (offer: Offer) => { const copy = { ...offer }; for (const key of OFFER_DESIGN_KEYS) delete copy[key]; return copy; };
const packageOffer = (extra: Partial<Offer> = {}) => withoutDesign(syncOfferWithPackage({ ...DEFAULT_OFFER, slug: "diwali", title: "Diwali offer", offerPrice: 2999,
  endsAt: "2026-12-01T18:29:59.999Z", status: "draft", ...extra }, pkg));

test("the design schema has the offer page's limits and contact rule", () => {
  assert.equal(packageDesignSchema.safeParse(design).success, true);
  assert.equal(packageDesignSchema.safeParse({ ...design, heading: " " }).success, false);
  assert.equal(packageDesignSchema.safeParse({ ...design, badge: "x".repeat(61) }).success, false);
  assert.equal(packageDesignSchema.safeParse({ ...design, contactHref: "http://example.com" }).success, false);
  assert.equal(packageDesignSchema.safeParse({ ...design, extra: "x" }).success, false, "no unknown fields");
  assert.equal(packageDesignSchema.safeParse(defaultPackageDesign(pkg)).success, true, "the defaults are a valid design");
  assert.equal(defaultPackageDesign(pkg).heading, "Business Starter");
});

test("an offer on a package needs no design of its own; an offer without a package still does", () => {
  assert.equal(offerSchema.safeParse(packageOffer()).success, true);
  const legacy = withoutDesign({ ...DEFAULT_OFFER, slug: "old", endsAt: "2026-12-01T18:29:59.999Z" });
  assert.equal(offerSchema.safeParse(legacy).success, false);
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, slug: "old", endsAt: "2026-12-01T18:29:59.999Z" }).success, true, "older offers keep working");
});

test("the page shows the package design, else an older offer's own fields, else the defaults", () => {
  const view = offerView(packageOffer(), pkg);
  assert.equal(view.heading, "Get your business"); assert.equal(view.description, "A business website.");
  assert.equal(view.title, "Diwali offer"); assert.equal(view.offerPrice, 2999);
  const older = { ...DEFAULT_OFFER, slug: "old", heading: "Old heading" };
  assert.equal(offerView(older).heading, "Old heading", "an offer saved before 7 Nov keeps its own design");
  assert.equal(offerView(older, { ...pkg, design: undefined }).heading, "Old heading", "a package without a design falls back to the offer's");
  assert.equal(offerView(withoutDesign(older), { ...pkg, design: undefined }).heading, "Business Starter", "else the defaults");
});

test("a package without an offer: main price crossed out and the normal price, no offer price of its own", () => {
  const view = packageView(pkg);
  assert.equal(view.mainPrice, 15000); assert.equal(view.discountPrice, 9999); assert.equal(view.offerPrice, 9999);
  assert.equal(view.title, "Business Starter"); assert.equal(view.packageId, "business-starter");
  assert.equal(Date.parse(view.endsAt), 0, "no countdown: no offer end");
  assert.deepEqual(view.inclusions, ["Website"]);
  const last = packageOffer({ status: "published", endsAt: "2026-10-01T00:00:00.000Z", reservationHoldHours: 48 });
  const after = packageView(pkg, last);
  assert.equal(after.slug, "diwali", "a reservation of the last offer stays findable");
  assert.equal(after.reservationHoldHours, 48);
  assert.equal(after.offerPrice, 9999, "the ended offer's price is never shown");
});

test("a package saved before page design keeps its last offer's design after that offer ends", () => {
  const older = { ...DEFAULT_OFFER, slug: "digital-dhamaka", packageId: pkg.id, heading: "Dhamaka heading", endsAt: "2026-11-08T18:29:59.999Z" };
  const plain = { ...pkg, design: undefined };
  assert.equal(packageView(plain, older).heading, "Dhamaka heading");
  assert.equal(inheritedDesign(plain, [older])?.ctaLabel, older.ctaLabel);
  assert.equal(inheritedDesign(plain, [withoutDesign(older)]), undefined, "a new offer has no design to give");
  assert.equal(inheritedDesign(pkg, [older])?.heading, "Get your business", "a package's own design always wins");
  assert.equal(packageView(plain).heading, "Business Starter", "no offer at all: the defaults");
});
