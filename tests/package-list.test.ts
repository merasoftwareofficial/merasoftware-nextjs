// Package list (lib/package-list.ts), used by the public "Pricing & Packages" pages and the admin Packages tab: type and
// category filters that only offer what the list has, the offers-first default, price and date sorts.
import assert from "node:assert/strict";
import test from "node:test";
import { adminEntry, arrangePackages, categoryFilterChoices, draftEntry, pageFilterChoices, DEFAULT_PACKAGE_LIST, publicEntry, typeFilterChoices, typeOf, usableOptions, type Entry, type PackageListOptions } from "../src/lib/package-list";
import type { ProjectCategory, QuotedPackage } from "../src/lib/sales-packages";

// A minimal package as the catalogue returns it; only the fields the list reads are set. `offerPrice` starts a running offer.
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
/** The public lines of a list of packages, in the order given (the admin's order). */
const publicLines = (items: QuotedPackage[]) => items.map(item => publicEntry(item, !!item.quote.offer));
const ids = (entries: Entry<QuotedPackage>[]) => entries.map(entry => entry.item.id);
const options = (over: Partial<PackageListOptions> = {}): PackageListOptions => ({ ...DEFAULT_PACKAGE_LIST, ...over });

test("a package with no billing counts as one-time, the same as its price unit", () => {
  assert.equal(typeOf({ billing: undefined }), "one_time");
  assert.equal(typeOf({ billing: "monthly" }), "monthly");
});

test("type and category choices contain only what the list has, in the portal's order", () => {
  const categories: ProjectCategory[] = [{ category: "business", label: "Business" }, { category: "website", label: "Website" }, { category: "shop", label: "Shop" }];
  const entries = publicLines([pkg("a", { category: "website" }), pkg("b", { category: "website", billing: "monthly" }), pkg("c", { category: "legacy_key" })]);
  assert.deepEqual(typeFilterChoices(entries).map(choice => [choice.value, choice.count]), [["one_time", 2], ["monthly", 1]]);
  assert.deepEqual(categoryFilterChoices(entries, categories).map(choice => [choice.value, choice.label, choice.count]),
    [["website", "Website", 2], ["legacy_key", "legacy_key", 1]], "no 'Business' or 'Shop' chip; an unknown key is shown as its key");
  assert.deepEqual(typeFilterChoices(publicLines([pkg("only", { billing: "monthly" })])).map(choice => choice.value), ["monthly"], "a list with one type offers that one");
});

test("type and category filters combine", () => {
  const entries = publicLines([pkg("ot-web", { category: "website" }), pkg("m-web", { category: "website", billing: "monthly" }), pkg("m-shop", { category: "shop", billing: "monthly" })]);
  assert.deepEqual(ids(arrangePackages(entries, options({ type: "monthly" }))), ["m-web", "m-shop"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ type: "monthly", category: "website" }))), ["m-web"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ type: "one_time", category: "shop" }))), []);
});

test("the default keeps offers first and the list's order inside each group", () => {
  const entries = publicLines([pkg("first"), pkg("second", { offerPrice: 9000 }), pkg("third"), pkg("fourth", { offerPrice: 8000 })]);
  assert.deepEqual(ids(arrangePackages(entries, options())), ["second", "fourth", "first", "third"]);
});

test("the offers-only switch keeps just the running offers", () => {
  const entries = publicLines([pkg("plain"), pkg("deal", { offerPrice: 7000 })]);
  assert.deepEqual(ids(arrangePackages(entries, options({ offersOnly: true }))), ["deal"]);
});

test("public price sort uses the price the card shows: the offer price while an offer runs", () => {
  const entries = publicLines([pkg("discounted", { discountedPrice: 12000 }), pkg("offered", { discountedPrice: 9000, offerPrice: 13000 }), pkg("cheap", { discountedPrice: 5000 })]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "price_asc" }))), ["cheap", "discounted", "offered"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "price_desc" }))), ["offered", "discounted", "cheap"]);
});

test("price sort with All puts one-time before monthly, each sorted by price", () => {
  const entries = publicLines([pkg("m-cheap", { billing: "monthly", discountedPrice: 1500 }), pkg("o-dear", { discountedPrice: 40000 }), pkg("m-dear", { billing: "monthly", discountedPrice: 4000 }), pkg("o-cheap", { discountedPrice: 9000 })]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "price_asc" }))), ["o-cheap", "o-dear", "m-cheap", "m-dear"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "price_desc" }))), ["o-dear", "o-cheap", "m-dear", "m-cheap"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "price_asc", type: "monthly" }))), ["m-cheap", "m-dear"], "inside one type the sort is plain");
});

test("recently added and recently modified are newest first, with undated packages last in the list's order", () => {
  const entries = publicLines([
    pkg("old", { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" }),
    pkg("undated"),
    pkg("new", { createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" }),
    pkg("undated-2"),
  ]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "added" }))), ["new", "old", "undated", "undated-2"]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "modified" }))), ["old", "new", "undated", "undated-2"]);
});

test("equal values keep the list's order (the sort is stable)", () => {
  const same = "2026-05-05T00:00:00.000Z";
  const entries = publicLines([pkg("a", { createdAt: same }), pkg("b", { createdAt: same }), pkg("c", { createdAt: same })]);
  assert.deepEqual(ids(arrangePackages(entries, options({ sort: "added" }))), ["a", "b", "c"]);
});

test("a chosen type or category this list does not have falls back to All", () => {
  const entries = publicLines([pkg("ot", { category: "website" }), pkg("ot-2", { category: "website" })]);
  assert.deepEqual(usableOptions(options({ type: "monthly", category: "shop" }), entries), options({ type: "all", category: "all" }));
  assert.deepEqual(usableOptions(options({ type: "one_time", category: "website" }), entries), options({ type: "one_time", category: "website" }));
});

test("a new draft is listed by what the admin typed so far, with its own dates and no price", () => {
  const typed = (item: Record<string, unknown>, dates = { createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-12T00:00:00.000Z" }) => draftEntry({ id: "draft" }, { data: { item }, ...dates });
  const monthly = typed({ billing: "monthly", category: "website", regularPrice: 5000 });
  assert.equal(typeOf(monthly), "monthly");
  assert.equal(monthly.category, "website");
  assert.equal(monthly.price, null, "the admin line shows no price for a new draft");
  assert.equal(monthly.createdAt, "2026-11-10T00:00:00.000Z");
  assert.equal(monthly.updatedAt, "2026-11-12T00:00:00.000Z");
  const blank = typed({});
  assert.equal(blank.category, "", "nothing typed yet");
  assert.equal(typeOf(blank), "one_time", "no billing chosen yet counts as one-time, like a package without billing");
});

test("a line with no category has no category chip, but still shows under All", () => {
  const entries = [draftEntry({ id: "new" }, { data: { item: {} } }), adminEntry({ id: "saved" }, { billing: "one_time", category: "website", discountedPrice: 5000, regularPrice: 5000 })];
  assert.deepEqual(categoryFilterChoices(entries, [{ category: "website", label: "Website" }]).map(choice => [choice.value, choice.count]), [["website", 1]]);
  assert.equal(arrangePackages(entries, options()).length, 2, "All shows both");
  assert.equal(arrangePackages(entries, options({ category: "website" })).length, 1, "the category filter shows only the saved package");
});

test("the page filter offers only pages that have packages, plus 'No page' when a package is on none", () => {
  const pages = [{ slug: "one-time-packages", title: "One-Time Packages" }, { slug: "monthly-packages", title: "Monthly Packages" }, { slug: "empty-page", title: "Empty Page" }];
  const line = (id: string, on: string[]) => adminEntry({ id }, { billing: "one_time", category: "website", discountedPrice: 1000, regularPrice: 1000 }, on);
  const entries = [line("a", ["one-time-packages"]), line("b", ["one-time-packages", "monthly-packages"]), line("c", ["monthly-packages"]), line("d", [])];
  assert.deepEqual(pageFilterChoices(entries, pages).map(choice => [choice.value, choice.label, choice.count]),
    [["one-time-packages", "One-Time Packages", 2], ["monthly-packages", "Monthly Packages", 2], ["none", "No page", 1]], "page order kept; Empty Page has no chip; a package on two pages counts on both");
  assert.deepEqual(pageFilterChoices(entries.slice(0, 3), pages).map(choice => choice.value), ["one-time-packages", "monthly-packages"], "no 'No page' chip when every package is on a page");
  const ids = (page: string) => arrangePackages(entries, options({ page })).map(entry => entry.item.id);
  assert.deepEqual(ids("one-time-packages"), ["a", "b"]);
  assert.deepEqual(ids("monthly-packages"), ["b", "c"]);
  assert.deepEqual(ids("none"), ["d"]);
  assert.deepEqual(ids("all"), ["a", "b", "c", "d"]);
  assert.equal(usableOptions(options({ page: "deleted-page" }), entries).page, "all", "a page that has no packages here falls back to All");
  assert.equal(usableOptions(options({ page: "none" }), entries.slice(0, 3)).page, "all", "'No page' falls back to All when every package is on a page");
});

test("a new draft's pages are the ones it ticked that still exist", () => {
  const draft = { data: { item: { pages: ["monthly-packages", "deleted-page", 7] } } };
  assert.deepEqual(draftEntry({ id: "d" }, draft, ["one-time-packages", "monthly-packages"]).pages, ["monthly-packages"]);
  assert.deepEqual(draftEntry({ id: "d" }, { data: { item: {} } }, ["monthly-packages"]).pages, []);
});

test("admin lines sort by the price the admin line shows; a line with no price goes last", () => {
  const line = (id: string, discountedPrice: number, billing?: "monthly") => adminEntry({ id }, { billing, category: "website", discountedPrice, regularPrice: discountedPrice });
  const entries = [line("main", 8000), line("discounted", 6000), { ...line("no-price", 5000), price: null }, line("monthly-cheap", 1000, "monthly")];
  const order = (sort: PackageListOptions["sort"]) => arrangePackages(entries, options({ sort })).map(entry => entry.item.id);
  assert.deepEqual(order("price_asc"), ["discounted", "main", "monthly-cheap", "no-price"], "one-time first, low to high; no price last");
  assert.deepEqual(order("price_desc"), ["main", "discounted", "monthly-cheap", "no-price"], "one-time first, high to low; no price last");
});
