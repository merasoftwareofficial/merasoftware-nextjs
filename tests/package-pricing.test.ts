import assert from "node:assert/strict";
import test from "node:test";
import { choicesForCategory, previewPrice, termsBoxText, typedFromTermsBox } from "../src/lib/package-pricing";
import type { AddOn, PricingSnapshot } from "../src/lib/sales-packages";

// Same scenarios as the backend's tests/packageServicesPricing.test.js: the form's preview and the portal
// backend must never disagree about a package's main price.
const addOn = (id: string, name: string, unitPrice: number, extra: Partial<AddOn> = {}): AddOn => ({ id, name, unitPrice, description: "", isHidden: false, isQuantityBased: false, compatibleWith: [], terms: [], ...extra });
const seo = addOn("seo", "SEO setup", 3000);
const pages = addOn("pages", "Extra page", 500, { isQuantityBased: true });
const hidden = addOn("hidden", "Hidden add-on", 100, { isHidden: true });
const dynamicOnly = addOn("dyn", "Dynamic only", 700, { compatibleWith: ["dynamic_websites"] });
const catalogue = [seo, pages, hidden, dynamicOnly];
const pick = (...rows: [string, number?][]) => rows.map(([featureId, quantity = 1]) => ({ featureId, quantity }));
const saved = (category: string, base: number, ...rows: [AddOn, number][]): { category: string; pricing: PricingSnapshot } => ({ category, pricing: { categoryBasePrice: base,
  services: rows.map(([row, quantity]) => ({ featureId: row.id, name: row.name, unitPrice: row.unitPrice, isQuantityBased: row.isQuantityBased, quantity })) } });

test("a new package: base price plus the add-ons at today's prices", () => {
  const result = previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick(["seo"], ["pages", 3]), addOns: catalogue });
  assert.equal(result.total, 10000 + 3000 + 1500);
  assert.deepEqual(result.lines.map(row => [row.name, row.quantity, row.price, row.frozen]), [["SEO setup", 1, 3000, false], ["Extra page", 3, 1500, false]]);
  assert.equal(previewPrice({ category: "standard_websites", basePrice: 10000, choices: [], addOns: catalogue }).total, 10000);
});

test("the automatic terms: the category first, then each chosen add-on; a saved package keeps the terms it was saved with", () => {
  const withTerms = [addOn("seo", "SEO setup", 3000, { terms: ["SEO 1", "SEO 2"] }), addOn("pages", "Extra page", 500, { isQuantityBased: true })];
  const fresh = previewPrice({ category: "standard_websites", basePrice: 10000, categoryTerms: ["Category A"], choices: pick(["seo"], ["pages", 2]), addOns: withTerms });
  assert.deepEqual(fresh.terms, ["Category A", "SEO 1", "SEO 2"]);
  // Later the add-on's terms change; the saved package keeps what it was saved with.
  const before = { category: "standard_websites", pricing: { categoryBasePrice: 10000, categoryTerms: ["Category A"], services: [{ featureId: "seo", name: "SEO setup", unitPrice: 3000, isQuantityBased: false, quantity: 1, terms: ["SEO 1"] }] } };
  const changed = addOn("seo", "SEO setup", 3000, { terms: ["SEO changed"] });
  assert.deepEqual(previewPrice({ category: "standard_websites", basePrice: 10000, categoryTerms: ["Category B"], choices: pick(["seo"]), addOns: [changed], saved: before }).terms, ["Category A", "SEO 1"]);
  // Untick the add-on: no terms left from it.
  assert.deepEqual(previewPrice({ category: "standard_websites", basePrice: 10000, categoryTerms: ["Category A"], choices: [], addOns: [changed], saved: before }).terms, ["Category A"]);
});

test("the terms box: automatic lines first, then the admin's own; automatic lines are never the admin's", () => {
  const automatic = ["Category A", "SEO 1"];
  assert.equal(termsBoxText(automatic, ["Mine"]), "Category A\nSEO 1\nMine");
  assert.equal(termsBoxText([], ["Mine"]), "Mine", "a typed package shows only its own lines");
  // An own line equal to an automatic one is shown once.
  assert.equal(termsBoxText(automatic, ["SEO 1", "Mine"]), "Category A\nSEO 1\nMine");
  // Typing below the automatic lines keeps only the admin's lines; a deleted automatic line is not the admin's and comes back by itself.
  assert.deepEqual(typedFromTermsBox("Category A\nSEO 1\nMine\nMore", automatic), ["Mine", "More"]);
  assert.deepEqual(typedFromTermsBox("SEO 1\nMine", automatic), ["Mine"]);
  // Untick the add-on: its lines are no longer automatic, so nothing of it is left in the box.
  assert.equal(termsBoxText(["Category A"], typedFromTermsBox("Category A\nSEO 1\nMine", automatic).filter(line => line !== "SEO 1")), "Category A\nMine");
  // A new empty line at the end stays (the admin is about to type).
  assert.deepEqual(typedFromTermsBox("Category A\nSEO 1\n", automatic), [""]);
});

test("a non-quantity add-on counts once; a bad quantity is a problem", () => {
  assert.equal(previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick(["seo", 5]), addOns: catalogue }).total, 13000);
  assert.match(previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick(["pages", 0]), addOns: catalogue }).problems[0], /1 to 1000/);
});

test("an unpriced category, a hidden or other-category add-on, and an unknown one cannot be priced", () => {
  assert.equal(previewPrice({ category: "x_cat", basePrice: null, choices: [], addOns: catalogue }).total, null);
  for (const id of ["hidden", "dyn", "ghost"]) {
    const result = previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick([id]), addOns: catalogue });
    assert.equal(result.total, null, id);
    assert.match(result.problems[0], /not offered/);
  }
});

test("a saved package keeps its prices whatever the catalogue says now", () => {
  const before = saved("standard_websites", 10000, [seo, 1], [pages, 2]);
  const today = [addOn("seo", "SEO setup", 7000), addOn("pages", "Extra page", 900, { isQuantityBased: true })];
  const result = previewPrice({ category: "standard_websites", basePrice: 99999, choices: pick(["seo"], ["pages", 2]), addOns: today, saved: before });
  assert.equal(result.total, 14000);
  assert.ok(result.lines.every(row => row.frozen));
  assert.equal(result.baseFrozen, true);
});

test("a saved add-on's quantity may change, its unit price does not; a new add-on takes today's price", () => {
  const before = saved("standard_websites", 10000, [pages, 1]);
  const today = [addOn("pages", "Extra page", 900, { isQuantityBased: true }), addOn("logo", "Logo", 2000)];
  const result = previewPrice({ category: "standard_websites", basePrice: 99999, choices: pick(["pages", 3], ["logo"]), addOns: today, saved: before });
  assert.equal(result.total, 10000 + 1500 + 2000);
  assert.deepEqual(result.lines.map(row => row.frozen), [true, false]);
});

test("an add-on withdrawn after saving stays in the package; \"Update to current prices\" names it", () => {
  const before = saved("standard_websites", 10000, [seo, 1]);
  const kept = previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick(["seo"]), addOns: [], saved: before });
  assert.equal(kept.total, 13000);
  assert.equal(kept.lines[0].offered, false);
  const refreshed = previewPrice({ category: "standard_websites", basePrice: 10000, choices: pick(["seo"]), addOns: [], saved: before, refresh: true });
  assert.equal(refreshed.total, null);
  assert.match(refreshed.problems[0], /SEO setup is no longer offered/);
});

test("refresh and a new category take every price afresh", () => {
  const before = saved("standard_websites", 10000, [seo, 1]);
  const today = [addOn("seo", "SEO setup", 4000)];
  assert.equal(previewPrice({ category: "standard_websites", basePrice: 11000, choices: pick(["seo"]), addOns: today, saved: before, refresh: true }).total, 15000);
  assert.equal(previewPrice({ category: "dynamic_websites", basePrice: 20000, choices: pick(["seo"]), addOns: today, saved: before }).total, 24000);
});

test("rounding is to two decimals", () => {
  assert.equal(previewPrice({ category: "c_one", basePrice: 0.1, choices: pick(["a"]), addOns: [addOn("a", "x", 0.2)] }).total, 0.3);
});

test("changing the category drops the add-ons it does not offer, unless the package was saved in that category", () => {
  assert.deepEqual(choicesForCategory(pick(["seo"], ["dyn"]), "standard_websites", catalogue), pick(["seo"]));
  assert.deepEqual(choicesForCategory(pick(["seo"], ["dyn"]), "dynamic_websites", catalogue), pick(["seo"], ["dyn"]));
  const before = saved("standard_websites", 10000, [addOn("gone", "Gone", 1), 1]);
  assert.deepEqual(choicesForCategory(pick(["gone"]), "standard_websites", [], before), pick(["gone"]));
  assert.deepEqual(choicesForCategory(pick(["gone"]), "dynamic_websites", [], before), []);
});
