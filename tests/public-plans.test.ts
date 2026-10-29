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

// --- One plan's own page (/plans/<name>-<id>) ---------------------------------------------------
import { choiceQuery, filePresets, initialChoice, planBenefit, planIdFromSegment, planPagePath, planSeoDescription, quoteRequest, slabRows } from "../src/lib/public-plans";

const releasable: PublicPlan = { ...flexible, maxTenureMonths: 12, customerCanChooseRelease: true, ratePerFile: 50, slabs: [{ fromFile: 11, ratePerFile: 40 }], billingOptions: [{ billingCycle: "monthly", discountPercent: 0 }, { billingCycle: "quarterly", discountPercent: 5 }] };

test("a plan page address carries a readable name and the id; only the id finds the plan", () => {
  assert.equal(planPagePath({ _id: starter._id, serviceName: "Website Updates – Starter!" }), `/plans/website-updates-starter-${starter._id}`);
  assert.equal(planIdFromSegment(`old-name-${starter._id}`), starter._id);
  assert.equal(planIdFromSegment(starter._id), starter._id);
  assert.equal(planIdFromSegment("website-updates"), null);
});

test("the builder starts on the plan's defaults, or on a choice from the address only when the plan offers it", () => {
  assert.deepEqual(initialChoice(releasable), { purchase: "one_time", tenureMonths: null, files: 5, updates: 1, releaseMode: "all_at_once" });
  const back = initialChoice(releasable, { purchase: "quarterly", months: "6", files: "15", updates: "3", release: "monthly" });
  assert.deepEqual(back, { purchase: "quarterly", tenureMonths: 6, files: 15, updates: 3, releaseMode: "monthly" });
  // Anything the plan does not offer falls back: 7 months is not a whole number of quarters, 17 files is off-step.
  assert.deepEqual(initialChoice(releasable, { purchase: "quarterly", months: "7", files: "17", updates: "9", release: "weekly" }), { purchase: "quarterly", tenureMonths: 3, files: 5, updates: 1, releaseMode: "all_at_once" });
  assert.equal(initialChoice({ ...base, billingOptions: [] }), null); // nothing to buy
});

test("the quote asks only for what the plan and purchase use; the release choice only where allowed", () => {
  const quarterly = initialChoice(releasable, { purchase: "quarterly", release: "monthly" })!;
  assert.deepEqual(quoteRequest(releasable, quarterly), { planId: releasable._id, purchase: "quarterly", tenureMonths: 3, files: 5, updates: 1, releaseMode: "monthly" });
  assert.deepEqual(quoteRequest(releasable, { ...quarterly, purchase: "monthly", tenureMonths: 1 }), { planId: releasable._id, purchase: "monthly", tenureMonths: 1, files: 5, updates: 1 });
  assert.deepEqual(quoteRequest(starter, initialChoice(starter)!), { planId: starter._id, purchase: "monthly", tenureMonths: 1 });
  assert.equal(planQuoteSchema.safeParse(quoteRequest(releasable, quarterly)).success, true);
  assert.equal(choiceQuery(releasable, quarterly), "purchase=quarterly&months=3&files=5&updates=1&release=monthly");
});

test("file quick picks, per-file rates and the card benefit come from the plan's own settings", () => {
  assert.deepEqual(filePresets({ ...flexible, files: { min: 10, max: 60, step: 10 } }), [10, 20, 40, 60]);
  assert.deepEqual(slabRows(releasable), [{ from: 1, to: 10, rate: 50 }, { from: 11, to: 20, rate: 40 }]);
  assert.deepEqual(slabRows(starter), []);
  assert.equal(planBenefit({ ...starter, portalAccessCount: 6, limitScope: "per_month", filesLimit: 20 }), "6 updates per month · up to 20 files each");
  assert.equal(planBenefit({ ...base, capability: "send_reminders" }), "We do the work and post updates for you. No file uploads needed.");
});

test("a plan page's built-in search description is plain text within 160 characters", () => {
  assert.equal(planSeoDescription({ ...starter, description: "<p>Monthly <b>website</b> updates.</p>" }), "Monthly website updates.");
  const long = planSeoDescription({ ...starter, description: "word ".repeat(60) });
  assert.ok(long.length <= 160 && long.endsWith("…"));
});
