// Run with: node --import tsx --test tests/package-per-file.test.ts
// The admin form's price check for a price-per-file package (src/lib/package-per-file.ts) must give exactly
// what the backend charges (helpers/salesPackages.js quotePackageChoice → servicePlanPricing.js). Both run
// here on many choices; if the backend maths ever changes, this test fails.
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { perFileChoices, perFileQuote, perFileReady, updatePrice } from "../src/lib/package-per-file";
import type { PackageMonthly } from "../src/lib/sales-packages";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = createRequire(path.resolve(root, "../backend/package.json"));
type BackendQuote = { finalPrice: number; monthly: { perMonthPrice: number; discountPercent: number; cyclePrice: number; totalCycles: number; totalPrice: number } };
const { quotePackageChoice } = backend("./helpers/salesPackages") as { quotePackageChoice: (item: unknown, offers: unknown[], choice: unknown) => BackendQuote };

const monthly = (discounts: [string, number][], files = { min: 10, max: 100, step: 10 }, updates = { min: 1, max: 4 }, maxTenureMonths = 12) => ({
  pricing: "per_file", billingOptions: discounts.map(([billingCycle, discountPercent]) => ({ billingCycle, discountPercent })), maxTenureMonths,
  files, updatesPerMonth: updates,
}) as PackageMonthly;
const pkg = (rate: number, m: PackageMonthly) => ({ id: "data-entry", name: "Data Entry", status: "published", category: "standard_websites", regularPrice: rate, discountedPrice: rate,
  offerExtraPrice: 0, offerSlug: "", inclusions: ["Monthly data entry"], terms: [], billing: "monthly", portalUploads: true, monthly: m });

test("the price check equals the backend's package quote on every choice", () => {
  let checked = 0;
  for (const rate of [50, 37.5, 12.34, 999, 1]) {
    for (const m of [
      monthly([["monthly", 0], ["quarterly", 10], ["half_yearly", 12.5], ["yearly", 33.33]]),
      monthly([["monthly", 5], ["quarterly", 0]], { min: 1, max: 7, step: 2 }, { min: 2, max: 3 }, 6),
      monthly([["yearly", 20]], { min: 5, max: 5, step: 1 }, { min: 1, max: 1 }),
    ]) {
      assert.ok(perFileReady(rate, m));
      const options = perFileChoices(m as Parameters<typeof perFileChoices>[0]);
      for (const billingCycle of options.cycles) for (const tenureMonths of options.lengths(billingCycle)) for (const files of options.files) for (const updates of options.updates) {
        const choice = { billingCycle, tenureMonths, files, updates };
        const mine = perFileQuote(rate, m, choice);
        const theirs = quotePackageChoice(pkg(rate, m), [], choice);
        assert.deepEqual(
          { perMonth: mine.perMonthPrice, discount: mine.discountPercent, cycle: mine.cyclePrice, cycles: mine.totalCycles, total: mine.totalPrice },
          { perMonth: theirs.monthly.perMonthPrice, discount: theirs.monthly.discountPercent, cycle: theirs.monthly.cyclePrice, cycles: theirs.monthly.totalCycles, total: theirs.monthly.totalPrice },
          JSON.stringify({ rate, choice }));
        assert.equal(mine.totalPrice, theirs.finalPrice);
        checked++;
      }
    }
  }
  assert.ok(checked > 500, `checked ${checked} choices`);
});

test("one update is files × price per file; the choices follow the package settings", () => {
  assert.equal(updatePrice(50, 20), 1000);
  const m = monthly([["monthly", 0], ["quarterly", 10]], { min: 10, max: 30, step: 10 }, { min: 1, max: 2 }, 6);
  const options = perFileChoices(m as Parameters<typeof perFileChoices>[0]);
  assert.deepEqual(options.files, [10, 20, 30]);
  assert.deepEqual(options.updates, [1, 2]);
  assert.deepEqual(options.cycles, ["monthly", "quarterly"]);
  assert.deepEqual(options.lengths("quarterly"), [3, 6]);
  // 20 files × ₹50 × 2 updates = ₹2,000 a month; a quarter at 10% off = ₹5,400; 6 months = ₹10,800.
  assert.deepEqual(perFileQuote(50, m, { billingCycle: "quarterly", tenureMonths: 6, files: 20, updates: 2 }),
    { updatePrice: 1000, perMonthPrice: 2000, cycleMonths: 3, discountPercent: 10, subtotal: 6000, discount: 600, cyclePrice: 5400, totalCycles: 2, totalPrice: 10800 });
});

test("an incomplete setting is not priced", () => {
  assert.equal(perFileReady(0, monthly([["monthly", 0]])), false);
  assert.equal(perFileReady(50, monthly([["monthly", 0]], { min: 10, max: 95, step: 10 })), false, "step does not divide the range");
  assert.equal(perFileReady(50, monthly([["monthly", 0]], undefined, { min: 3, max: 2 })), false);
  assert.equal(perFileReady(50, monthly([])), false);
});
