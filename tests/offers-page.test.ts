// Run with: node --import tsx --test tests/offers-page.test.ts
// Which cards the /offers page shows (lib/offers-page.ts): one per package, running first, then expired.
import assert from "node:assert/strict";
import test from "node:test";
import { endedFromQuote, offerCards } from "../src/lib/offers-page";
import { DEFAULT_OFFER, type Offer } from "../src/lib/offers";
import type { QuotedPackage } from "../src/lib/sales-packages";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const day = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const offer = (slug: string, packageId: string | undefined, endsAt: number, status: Offer["status"] = "published", offerPrice = 999): Offer =>
  ({ ...DEFAULT_OFFER, slug, title: `Offer ${slug}`, status, packageId, endsAt: iso(endsAt), offerPrice });
const pkg = (id: string, running?: Offer): QuotedPackage => ({
  id, name: id, description: "", status: "published", category: "standard_websites", regularPrice: 5000, discountedPrice: 4000, offerExtraPrice: 0,
  offerSlug: running?.slug ?? "", inclusions: ["x"], terms: [], linkedPlanIds: [], order: 0, pages: [], quoteKey: "k",
  quote: { regularPrice: 5000, discountAmount: 0, finalPrice: running ? running.offerPrice : 4000, offer: running ? { ...running, resolvedTerms: [], quoteKey: "q" } : null, terms: [] },
} as unknown as QuotedPackage);
const ids = (cards: ReturnType<typeof offerCards>) => cards.map(card => `${card.item.id}:${card.ended?.slug ?? "running"}`);

test("running offers first, then expired ones, latest end first", () => {
  const running = offer("live", "a", NOW + day);
  const offers = [running, offer("old-b", "b", NOW - 3 * day), offer("old-c", "c", NOW - day)];
  assert.deepEqual(ids(offerCards([pkg("b"), pkg("c"), pkg("a", running), pkg("d")], offers, NOW)), ["a:running", "c:old-c", "b:old-b"]);
});

test("one card per package: a running offer hides the package's expired ones, else the latest expired shows", () => {
  const running = offer("new", "a", NOW + day);
  const offers = [offer("first", "a", NOW - 5 * day), running, offer("one", "b", NOW - 5 * day), offer("two", "b", NOW - 2 * day)];
  assert.deepEqual(ids(offerCards([pkg("a", running), pkg("b")], offers, NOW)), ["a:running", "b:two"]);
});

test("an archived (deleted) or draft offer, or one without a package, never shows", () => {
  const offers = [offer("gone", "a", NOW - day, "archived"), offer("draft", "b", NOW - day, "draft"), offer("legacy", undefined, NOW - day)];
  assert.deepEqual(offerCards([pkg("a"), pkg("b")], offers, NOW), []);
  // The archived one was the latest; an older published one of the same package still shows.
  assert.deepEqual(ids(offerCards([pkg("a")], [...offers, offer("older", "a", NOW - 4 * day)], NOW)), ["a:older"]);
});

test("a package that is not on the published list shows nothing", () => {
  assert.deepEqual(offerCards([], [offer("x", "gone-package", NOW - day)], NOW), []);
});

test("an expired card keeps its offer price and end", () => {
  const [card] = offerCards([pkg("a")], [offer("x", "a", NOW - day, "published", 2499)], NOW);
  assert.deepEqual(card.ended, { slug: "x", title: "Offer x", offerPrice: 2499, endsAt: iso(NOW - day) });
  const running = offer("live", "a", NOW + day, "published", 1999);
  assert.deepEqual(endedFromQuote(pkg("a", running)), { slug: "live", title: "Offer live", offerPrice: 1999, endsAt: iso(NOW + day) });
  assert.equal(endedFromQuote(pkg("b")), null);
});
