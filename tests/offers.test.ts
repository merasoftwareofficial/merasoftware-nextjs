import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_OFFER, DEFAULT_UNIVERSAL_TERMS, offerSchema, publishedOffers, resolvedOffers, resolvedTerms } from "../src/lib/offers";

test("existing offer survives migration and can be hidden without resurfacing", () => {
  assert.equal(publishedOffers()[0].slug, "page");
  assert.equal(offerSchema.parse(DEFAULT_OFFER).endsAt, "2026-11-02T23:59:59+05:30");
  assert.equal(publishedOffers({ page: { ...DEFAULT_OFFER, status: "draft" } }).length, 0);
  assert.equal(publishedOffers({ page: { ...DEFAULT_OFFER, status: "archived" } }).length, 0);
  const saved = { page: { ...DEFAULT_OFFER, title: "Updated offer" }, second: { ...DEFAULT_OFFER, slug: "second", order: 1 } };
  assert.equal(resolvedOffers(saved).length, 2);
  assert.equal(publishedOffers(saved)[0].title, "Updated offer");
});

test("offer validation rejects invalid prices, slugs, contact protocols and deadlines", () => {
  for (const patch of [
    { offerPrice: 5000 }, { discountPrice: 20000 }, { offerPrice: -1 },
    { slug: "a.b" }, { slug: "constructor" }, { slug: "Bad Slug" },
    { contactHref: "javascript:alert(1)" }, { contactHref: "http://example.com" },
    { endsAt: "tomorrow" }, { inclusions: [] },
  ]) assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, ...patch }).success, false, JSON.stringify(patch));
  for (const contactHref of ["mailto:hello@example.com", "tel:+919876543210", "https://wa.me/919876543210"]) {
    assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, contactHref }).success, true);
  }
});

test("terms modes and validity reflect the current saved deadline", () => {
  const offer = { ...DEFAULT_OFFER, endsAt: "2026-11-01T23:59:59+05:30", terms: ["Offer-only term"] };
  assert(resolvedTerms(offer, DEFAULT_UNIVERSAL_TERMS)[0].includes("1 November 2026"));
  assert(resolvedTerms(offer, ["Common term"]).includes("Common term"));
  assert(!resolvedTerms({ ...offer, termsMode: "offer" }, ["Common term"]).includes("Common term"));
  assert(!resolvedTerms({ ...offer, termsMode: "universal" }, ["Common term"]).includes("Offer-only term"));
});

test("JSON saves preserve other offers and existing website settings", async () => {
  const previous = process.cwd();
  const folder = mkdtempSync(path.join(tmpdir(), "mera-offers-test-"));
  try {
    process.chdir(folder);
    const { jsonDriver } = await import("../src/lib/repo/json-driver");
    await jsonDriver.settings.update({ commentsEnabled: false });
    const [first, second] = await Promise.all([
      jsonDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "first" }, true),
      jsonDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "second" }, true),
    ]);
    assert(first && second);
    assert.equal(await jsonDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "first" }, true), false);
    await jsonDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "first", status: "archived" }, false);
    const saved = JSON.parse(readFileSync(path.join(folder, ".data/settings.json"), "utf8"))[0];
    assert.equal(saved.commentsEnabled, false);
    assert.equal(saved.offers.first.status, "archived");
    assert.equal(saved.offers.second.title, DEFAULT_OFFER.title);
    await Promise.all([
      jsonDriver.settings.update({ offerUniversalTerms: ["Shared term"] }),
      jsonDriver.settings.saveOffer({ ...DEFAULT_OFFER, slug: "parallel" }, true),
    ]);
    assert((await jsonDriver.settings.get()).offers?.parallel);
  } finally { process.chdir(previous); }
});


test("commercial offer rules validate categories, percentages and displayed prices", () => {
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, applicableCategories: ["social"] }).success, false);
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, pricingRule: "percentage", benefitValue: 101 }).success, false);
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, offerPrice: 699.123 }).success, false);
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, pricingRule: "percentage", benefitValue: 10, discountPrice: 10000, offerPrice: 9000 }).success, true);
  assert.equal(offerSchema.safeParse({ ...DEFAULT_OFFER, pricingRule: "percentage", benefitValue: 10 }).success, false);
});
