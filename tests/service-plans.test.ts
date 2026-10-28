// Website plan form ↔ backend savePlan() body (src/lib/service-plans.ts; docs/plan.md Phase 2a).
// The website never prices a plan; this only checks that the form sends the fields that apply.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankPlanForm, categoryKeyFrom, formFromPlan, planBody as savePlanBody, rangeText, type StoredPlan } from "../src/lib/service-plans";

// The body is { planId } | { creating } plus the plan fields; read it as one record so `next build` type-checks.
const planBody = (form: Parameters<typeof savePlanBody>[0]) => savePlanBody(form) as Record<string, unknown>;

const starter: StoredPlan = {
  _id: "p1", updatedAt: "2026-10-28T00:00:00.000Z", serviceName: "Starter Update Plan", description: "One update a month", isHidden: false, retired: false, canBeOnSale: true, price: 1490,
  priceRange: { unit: "month", from: 1490, to: 1490 },
  servicePlan: {
    categoryKey: "website_updates", capability: "upload_data", dependency: "standalone_or_project", timing: "during_and_after", purchaseType: "recurring",
    monthlyReferencePrice: 1490, limitScope: "per_month", portalAccessCount: 1, filesLimit: 20, maxTenureMonths: 12,
    billingOptions: [{ billingCycle: "monthly", discountPercent: 0 }, { billingCycle: "quarterly", discountPercent: 3 }, { billingCycle: "yearly", discountPercent: 8 }],
  },
};

test("a saved fixed plan round-trips into the same save body", () => {
  const body = planBody(formFromPlan(starter));
  assert.equal(body.planId, "p1");
  assert.equal(body.expectedUpdatedAt, starter.updatedAt);
  assert.equal(body.creating, undefined);
  assert.deepEqual(body.billingOptions, starter.servicePlan.billingOptions);
  assert.deepEqual([body.pricingMode, body.purchaseType, body.monthlyReferencePrice, body.limitScope, body.portalAccessCount, body.filesLimit], ["fixed", "recurring", 1490, "per_month", 1, 20]);
  assert.equal(body.oneTimePrice, undefined);
  assert.equal(body.files, undefined);
  assert.equal(body.oneTimeValidityDays, undefined); // no one-time purchase on this plan
});

test("a new flexible plan sends files, rates and updates, never fixed limits", () => {
  const form = { ...blankPlanForm("online_promotions"), serviceName: "Promotions", pricingMode: "flexible" as const, ratePerFile: 100, slabs: [{ fromFile: 11, ratePerFile: 50 }], allowOneTime: true };
  const body = planBody(form);
  assert.equal(body.creating, true);
  assert.deepEqual([body.pricingMode, body.ratePerFile, body.allowOneTime, body.oneTimeValidityDays, body.isHidden], ["flexible", 100, true, 90, true]);
  assert.deepEqual(body.files, { min: 5, max: 50, step: 5 });
  assert.deepEqual(body.updatesPerMonth, { min: 1, max: 4 });
  assert.equal(body.limitScope, undefined);
  assert.equal(body.purchaseType, undefined);
});

test("a no-upload plan sends no upload limits; standalone sends no timing", () => {
  const body = planBody({ ...blankPlanForm(), serviceName: "Live Chat", capability: "send_reminders", purchaseType: "one_time", oneTimePrice: 2500, dependency: "standalone_only" });
  assert.deepEqual([body.oneTimePrice, body.limitScope, body.filesLimit, body.timing, body.billingOptions], [2500, undefined, undefined, undefined, undefined]);
});

test("labels", () => {
  assert.equal(categoryKeyFrom("Online Promotions"), "online_promotions");
  assert.equal(categoryKeyFrom("  2024 SEO!! "), "seo");
  assert.equal(rangeText({ unit: "update", from: 500, to: 4300 }), "₹500 – ₹4,300 per update");
  assert.equal(rangeText({ unit: "one_time", from: 1500, to: 1500 }), "₹1,500 one-time");
});
