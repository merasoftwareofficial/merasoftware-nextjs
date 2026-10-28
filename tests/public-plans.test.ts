// Public plans page helpers (src/lib/public-plans.ts; docs/plan.md §0.2 P6). The page never prices a
// plan: these only list a plan's own choices and check the estimator request before it is forwarded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileChoices, lengthChoices, planQuoteSchema, purchaseChoices, rangeLabel, updateChoices, type PublicPlan } from "../src/lib/public-plans";

const base: PublicPlan = {
  _id: "6a8fef6dbb9689780dc6546d", serviceName: "Plan", description: "", categoryKey: "website_updates", priceRange: null,
  pricingMode: "fixed", capability: "upload_data", purchaseType: "recurring", allowOneTime: false, oneTimeValidityDays: null,
  maxTenureMonths: 12, billingOptions: [], releaseMode: "all_at_once", customerCanChooseRelease: false,
};
const starter: PublicPlan = { ...base, billingOptions: [{ billingCycle: "yearly", discountPercent: 8 }, { billingCycle: "monthly", discountPercent: 0 }, { billingCycle: "quarterly", discountPercent: 3 }] };
const flexible: PublicPlan = {
  ...base, pricingMode: "flexible", allowOneTime: true, maxTenureMonths: 6, files: { min: 5, max: 20, step: 5 }, updatesPerMonth: { min: 1, max: 3 },
  billingOptions: [{ billingCycle: "monthly", discountPercent: 0 }, { billingCycle: "yearly", discountPercent: 8 }],
};

test("a fixed recurring plan offers its billing periods, shortest first, and whole lengths up to 12 months", () => {
  assert.deepEqual(purchaseChoices(starter).map(choice => choice.value), ["monthly", "quarterly", "yearly"]);
  assert.deepEqual(lengthChoices(starter, 3), [3, 6, 9, 12]);
  assert.deepEqual(lengthChoices(starter, 12), [12]);
  assert.deepEqual(fileChoices(starter), []);
});

test("a flexible plan: one-time first, periods within its own maximum length, its files and updates", () => {
  assert.deepEqual(purchaseChoices(flexible).map(choice => choice.value), ["one_time", "monthly"]); // yearly > 6 months
  assert.deepEqual(lengthChoices(flexible, 1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(fileChoices(flexible), [5, 10, 15, 20]);
  assert.deepEqual(updateChoices(flexible), [1, 2, 3]);
});

test("a fixed one-time plan offers only one-time", () => {
  assert.deepEqual(purchaseChoices({ ...base, purchaseType: "one_time", allowOneTime: true, billingOptions: [{ billingCycle: "monthly", discountPercent: 0 }] }).map(choice => choice.value), ["one_time"]);
});

test("card range text comes from the backend range only", () => {
  assert.equal(rangeLabel({ unit: "update", from: 500, to: 4300 }), "From ₹500 / update");
  assert.equal(rangeLabel({ unit: "month", from: 1490, to: 1490 }), "₹1,490 / month");
  assert.equal(rangeLabel(null), "");
});

test("the estimator request is checked before it is forwarded", () => {
  assert.equal(planQuoteSchema.safeParse({ planId: starter._id, purchase: "quarterly", tenureMonths: 6 }).success, true);
  assert.equal(planQuoteSchema.safeParse({ planId: starter._id, purchase: "every_2_years" }).success, false);
  assert.equal(planQuoteSchema.safeParse({ planId: "not-an-id", purchase: "monthly" }).success, false);
  assert.equal(planQuoteSchema.safeParse({ planId: starter._id, purchase: "monthly", tenureMonths: 24 }).success, false);
  assert.equal(planQuoteSchema.safeParse({ planId: starter._id, purchase: "monthly", price: 1 }).success, false); // no extra fields
});
