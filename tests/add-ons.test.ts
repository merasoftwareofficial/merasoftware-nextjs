import assert from "node:assert/strict";
import test from "node:test";
import { addOnSchema, portalAddOnBody, removeAddOn, saveAddOn, type AddOnDeps } from "../src/lib/add-ons";

const ID = "64b7f0c2a1b2c3d4e5f60718";
const good = { name: " SEO setup ", unitPrice: 3000, description: "Basics", isHidden: false, isQuantityBased: true, compatibleWith: ["standard_websites"] };
function fake(overrides: Partial<AddOnDeps> = {}) {
  const calls: { action: string; body: Record<string, unknown> }[] = [];
  const deps: AddOnDeps = {
    catalogue: async () => ({ categories: [{ category: "standard_websites" }, { category: "dynamic_websites" }], addOns: [{ id: ID }] }),
    forward: async (action, body) => { calls.push({ action, body }); return { _id: ID }; }, ...overrides };
  return { deps, calls };
}

test("the portal gets exactly the fields its own add-on form sends, with the category fixed", () => {
  assert.deepEqual(portalAddOnBody(addOnSchema.parse(good)), { serviceName: "SEO setup", category: "feature_upgrades", price: 3000, sellingPrice: 3000,
    formattedDescriptions: [{ content: "Basics" }], isHidden: false, isQuantityBased: true, compatibleWith: ["standard_websites"] });
  assert.deepEqual(portalAddOnBody(addOnSchema.parse({ ...good, id: ID, description: "" })).formattedDescriptions, []);
  assert.equal(portalAddOnBody(addOnSchema.parse({ ...good, id: ID }))._id, ID);
});

test("anything else in the request is refused, so no portal field can be set from outside", async () => {
  const { deps, calls } = fake();
  for (const extra of [{ category: "service_plan" }, { isServicePlan: true }, { servicePlan: {} }, { retiredAt: null }, { _id: ID }]) {
    assert.equal((await saveAddOn({ ...good, ...extra }, deps)).status, 400, JSON.stringify(extra));
  }
  assert.equal(calls.length, 0);
});

test("name, price and categories are checked", async () => {
  const { deps, calls } = fake();
  for (const bad of [{ name: "  " }, { name: "x".repeat(121) }, { unitPrice: -1 }, { unitPrice: 1.234 }, { unitPrice: 10000001 }, { unitPrice: Number.NaN }, { compatibleWith: ["standard_websites", "Not A Key"] }, { description: "x".repeat(1001) }]) {
    assert.equal((await saveAddOn({ ...good, ...bad }, deps)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await saveAddOn({ ...good, compatibleWith: ["unknown_category"] }, deps)).status, 400);
  assert.equal(calls.length, 0);
});

test("a new add-on is created; an existing one is updated; a service that is not an add-on is never touched", async () => {
  const { deps, calls } = fake();
  assert.deepEqual(await saveAddOn(good, deps), { status: 201, body: { id: ID } });
  assert.equal(calls[0].action, "create");
  assert.deepEqual(await saveAddOn({ ...good, id: ID }, deps), { status: 200, body: { id: ID } });
  assert.equal(calls[1].action, "update");
  const other = "64b7f0c2a1b2c3d4e5f60999";
  assert.equal((await saveAddOn({ ...good, id: other }, deps)).status, 404);
  assert.equal((await removeAddOn({ id: other }, deps)).status, 404);
  assert.equal(calls.length, 2, "nothing was forwarded for the unknown service");
});

test("delete forwards only the id; the portal's refusal (a bought service) reaches the admin", async () => {
  const ok = fake();
  assert.deepEqual(await removeAddOn({ id: ID }, ok.deps), { status: 200, body: { id: ID } });
  assert.deepEqual(ok.calls, [{ action: "remove", body: { _id: ID } }]);
  assert.equal((await removeAddOn({ id: ID, extra: 1 }, ok.deps)).status, 400);
  assert.equal((await removeAddOn({ id: "nope" }, ok.deps)).status, 400);
  const refused = fake({ forward: async () => { throw new Error("This product has 2 purchases and cannot be deleted. Retire it instead to keep the customer's history intact."); } });
  await assert.rejects(removeAddOn({ id: ID }, refused.deps), /2 purchases and cannot be deleted/);
});
