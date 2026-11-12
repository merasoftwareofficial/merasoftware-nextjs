// Package list (lib/package-list.ts) on a "Pricing & Packages" page: type and category filters that only offer
// what the page has, the offers-first default, price and date sorts, and plans never being part of it.
import assert from "node:assert/strict";
import test from "node:test";
import { arrangePackages, categoryChoices, DEFAULT_PACKAGE_LIST, typeChoices, typeOf, usableOptions, type PackageListOptions } from "../src/lib/package-list";
import type { ProjectCategory, QuotedPackage } from "../src/lib/sales-packages";

// A minimal package as the catalogue returns it; only the fields the list reads are set.
function pkg(id: string, over: Partial<QuotedPackage> & { offerPrice?: number } = {}): QuotedPackage {
  const { offerPrice, ...rest } = over;
  const offer = offerPrice === undefined ? null : { slug: `offer-${id}`, title: "Offer", endsAt: "2099-01-01T00:00:00.000Z" } as unknown as QuotedPackage["quote"]["offer"];
  return {
    id, name: id, description: "", status: "published", category: "website", regularPrice: 20000, discountedPrice: 15000, offerExtraPrice: 0,
    offerSlug: "", inclusions: [], terms: [], linkedPlanIds: [], order: 0, billing: "one_time",
    quoteKey: "q", quote: { regularPrice: 15000, discountAmount: 0, finalPrice: offerPrice ?? 15000, offer, terms: [] },
    ...rest,
  } as QuotedPackage;
}
const isOffer = (item: QuotedPackage) => !!item.quote.offer;
const ids = (list: QuotedPackage[]) => list.map(item => item.id);
const options = (over: Partial<PackageListOptions> = {}): PackageListOptions => ({ ...DEFAULT_PACKAGE_LIST, ...over });

test("a package with no billing counts as one-time, the same as its price unit", () => {
  assert.equal(typeOf(pkg("old", { billing: undefined })), "one_time");
  assert.equal(typeOf(pkg("m", { billing: "monthly" })), "monthly");
});

test("type and category choices contain only what the page has, in the portal's order", () => {
  const categories: ProjectCategory[] = [{ category: "business", label: "Business" }, { category: "website", label: "Website" }, { category: "shop", label: "Shop" }];
  const items = [pkg("a", { category: "website" }), pkg("b", { category: "website", billing: "monthly" }), pkg("c", { category: "legacy_key" })];
  assert.deepEqual(typeChoices(items).map(choice => [choice.value, choice.count]), [["one_time", 2], ["monthly", 1]]);
  assert.deepEqual(categoryChoices(items, categories).map(choice => [choice.value, choice.label, choice.count]),
    [["website", "Website", 2], ["legacy_key", "legacy_key", 1]], "no 'Business' or 'Shop' chip; an unknown key is shown as its key");
  assert.deepEqual(typeChoices([pkg("only", { billing: "monthly" })]).map(choice => choice.value), ["monthly"], "a page with one type offers that one");
});

test("type and category filters combine", () => {
  const items = [pkg("ot-web", { category: "website" }), pkg("m-web", { category: "website", billing: "monthly" }), pkg("m-shop", { category: "shop", billing: "monthly" })];
  assert.deepEqual(ids(arrangePackages(items, options({ type: "monthly" }), isOffer)), ["m-web", "m-shop"]);
  assert.deepEqual(ids(arrangePackages(items, options({ type: "monthly", category: "website" }), isOffer)), ["m-web"]);
  assert.deepEqual(ids(arrangePackages(items, options({ type: "one_time", category: "shop" }), isOffer)), []);
});

test("the default keeps offers first and the admin's order inside each group", () => {
  const items = [pkg("first"), pkg("second", { offerPrice: 9000 }), pkg("third"), pkg("fourth", { offerPrice: 8000 })];
  assert.deepEqual(ids(arrangePackages(items, options(), isOffer)), ["second", "fourth", "first", "third"]);
});

test("the offers-only switch keeps just the running offers", () => {
  const items = [pkg("plain"), pkg("deal", { offerPrice: 7000 })];
  assert.deepEqual(ids(arrangePackages(items, options({ offersOnly: true }), isOffer)), ["deal"]);
});

test("price sort uses the price the card shows: the offer price while an offer runs", () => {
  const items = [pkg("discounted", { discountedPrice: 12000 }), pkg("offered", { discountedPrice: 9000, offerPrice: 13000 }), pkg("cheap", { discountedPrice: 5000 })];
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "price_asc" }), isOffer)), ["cheap", "discounted", "offered"]);
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "price_desc" }), isOffer)), ["offered", "discounted", "cheap"]);
});

test("price sort with All puts one-time packages before monthly, each sorted by price", () => {
  const items = [pkg("m-cheap", { billing: "monthly", discountedPrice: 1500 }), pkg("o-dear", { discountedPrice: 40000 }), pkg("m-dear", { billing: "monthly", discountedPrice: 4000 }), pkg("o-cheap", { discountedPrice: 9000 })];
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "price_asc" }), isOffer)), ["o-cheap", "o-dear", "m-cheap", "m-dear"]);
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "price_desc", type: "all" }), isOffer)), ["o-dear", "o-cheap", "m-dear", "m-cheap"]);
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "price_asc", type: "monthly" }), isOffer)), ["m-cheap", "m-dear"], "inside one type the sort is plain");
});

test("recently added and recently modified are newest first, with undated packages last in the admin's order", () => {
  const items = [
    pkg("old", { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" }),
    pkg("undated"),
    pkg("new", { createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }),
    pkg("undated-2"),
  ];
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "added" }), isOffer)), ["new", "old", "undated", "undated-2"]);
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "modified" }), isOffer)), ["old", "new", "undated", "undated-2"]);
});

test("equal values keep the admin's order (the sort is stable)", () => {
  const same = "2026-05-05T00:00:00.000Z";
  const items = [pkg("a", { createdAt: same }), pkg("b", { createdAt: same }), pkg("c", { createdAt: same })];
  assert.deepEqual(ids(arrangePackages(items, options({ sort: "added" }), isOffer)), ["a", "b", "c"]);
});

test("a chosen type or category this page does not have falls back to All", () => {
  const items = [pkg("ot", { category: "website" }), pkg("ot-2", { category: "website" })];
  assert.deepEqual(usableOptions(options({ type: "monthly", category: "shop" }), items), options({ type: "all", category: "all" }));
  assert.deepEqual(usableOptions(options({ type: "one_time", category: "website" }), items), options({ type: "one_time", category: "website" }));
});
