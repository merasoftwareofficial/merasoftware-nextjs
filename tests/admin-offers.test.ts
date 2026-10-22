import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_OFFER } from "../src/lib/offers";
import { offerState, legacyOfferDestination } from "../src/lib/admin-offers";

test("expiry changes the admin view at the deadline without changing publication state", () => {
  const offer = { ...DEFAULT_OFFER, endsAt: "2026-11-02T18:29:59Z" };
  const end = Date.parse(offer.endsAt);
  assert.equal(offerState(offer, end - 1), "active");
  assert.equal(offerState(offer, end), "expired");
  assert.equal(offerState({ ...offer, status: "draft" }, end), "draft");
  assert.equal(offerState({ ...offer, status: "archived" }, end - 1), "archived");
  assert.equal(offerState(offer, null), "published");
  assert.equal(offer.status, "published");
});

test("old section bookmarks retain their section and unknown input stays inside the offer hub", () => {
  for (const section of ["details", "listing", "terms"]) assert.equal(legacyOfferDestination(section), `/admin/offers?section=${section}`);
  assert.equal(legacyOfferDestination(), "/admin/offers?section=details");
  assert.equal(legacyOfferDestination("https://elsewhere.test"), "/admin/offers?section=details");
});
