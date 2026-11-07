// A new offer's link comes from its name and is never reused (src/docs/package-offers.md, owner decision 7 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { offerSlugFor } from "@/lib/offer-packages";

test("an offer link is made from its name, the next number while taken, never a reserved word", () => {
  assert.equal(offerSlugFor("Diwali Launch Offer", new Set()), "diwali-launch-offer");
  assert.equal(offerSlugFor("Diwali Launch Offer", new Set(["diwali-launch-offer"])), "diwali-launch-offer-2");
  assert.equal(offerSlugFor("Diwali Launch Offer", new Set(["diwali-launch-offer", "diwali-launch-offer-2"])), "diwali-launch-offer-3");
  assert.equal(offerSlugFor("दिवाली ऑफर", new Set()), "offer", "a name without Latin letters");
  assert.equal(offerSlugFor("New", new Set()), "offer", "a reserved word is never a link");
  assert.equal(offerSlugFor("  Big   Sale!! ", new Set()), "big-sale");
  assert.ok(offerSlugFor("x".repeat(200), new Set()).length <= 70);
});
