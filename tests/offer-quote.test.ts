// Run with: node --conditions=react-server --import tsx --test tests/offer-quote.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { offerWithQuote } from "../src/lib/offer-quote";
import { DEFAULT_OFFER, DEFAULT_UNIVERSAL_TERMS, offerSchema } from "../src/lib/offers";

test("the reserve window is timing only: it never changes an offer's quote key", () => {
  const offer = offerSchema.parse(DEFAULT_OFFER);
  const base = offerWithQuote(offer, DEFAULT_UNIVERSAL_TERMS);
  // Recorded before the reserve window existed: offers without it keep their exact key.
  assert.equal(base.quoteKey, "e983da20ddde82602c95e39fd6ffaaf297fb7d80bd649275de81c35aa5c785e6");
  const windowed = offerWithQuote({ ...offer, reserveWindowHours: 48 }, DEFAULT_UNIVERSAL_TERMS);
  assert.equal(windowed.quoteKey, base.quoteKey);
  // The backend still receives the setting.
  assert.equal(windowed.reserveWindowHours, 48);
  // Price and terms remain signed.
  assert.notEqual(offerWithQuote({ ...offer, offerPrice: 599 }, DEFAULT_UNIVERSAL_TERMS).quoteKey, base.quoteKey);
  assert.notEqual(offerWithQuote({ ...offer, terms: ["Changed"] }, DEFAULT_UNIVERSAL_TERMS).quoteKey, base.quoteKey);
});
