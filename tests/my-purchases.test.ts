// My Account → My purchases (src/lib/my-purchases.ts; docs/plan.md decision 11): bought plans from the
// portal's order list with the backend's own status words, and the two Overview live lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { offersLine, purchasesFrom, purchasesLine, type PortalOrder } from "../src/lib/my-purchases";

const PORTAL = "https://portal.example.test";
const plan = (id: string, code: string, label: string, tone: string, createdAt: string, extra: Partial<PortalOrder> = {}): PortalOrder => ({
  _id: id, isServicePlan: true, orderVisibility: "approved", createdAt, servicePlanSnapshot: { serviceName: `Plan ${id}` },
  orderState: { code, label, tone }, ...extra,
});

test("only bought plans, newest first, each with the portal's status and its own portal page", () => {
  const rows = purchasesFrom([
    plan("a1", "plan_active", "Active", "positive", "2026-10-01T10:00:00Z"),
    { _id: "p1", isServicePlan: false, createdAt: "2026-10-20T10:00:00Z", orderState: { code: "in_progress", label: "In Progress · 40%", tone: "active" } },
    plan("b2", "pending_approval", "Approval Pending", "warning", "2026-10-29T10:00:00Z", { orderVisibility: "pending-approval" }),
    plan("h3", "plan_active", "Active", "positive", "2026-10-28T10:00:00Z", { orderVisibility: "hidden" }),
    plan("c3", "rejected", "Payment Rejected", "danger", "2026-10-15T10:00:00Z", { servicePlanSnapshot: null, productId: { serviceName: "Care Plan" } }),
  ], PORTAL);
  assert.deepEqual(rows.map(row => [row.id, row.name, row.status, row.tone]), [
    ["b2", "Plan b2", "Approval Pending", "warning"],
    ["c3", "Care Plan", "Payment Rejected", "danger"],
    ["a1", "Plan a1", "Active", "positive"],
  ]);
  assert.equal(rows[0].href, "https://portal.example.test/plan-details/b2");
  assert.equal(rows.every(row => row.kind === "plan"), true);
});

test("an unknown tone or missing state never breaks a card", () => {
  const [row] = purchasesFrom([{ _id: "x", isServicePlan: true, orderState: { tone: "sparkly" } }], PORTAL);
  assert.deepEqual([row.name, row.status, row.code, row.tone, row.boughtAt], ["Plan", "Processing", "processing", "neutral", null]);
});

test("the My purchases line names only what matters now, and says when nothing was bought", () => {
  const rows = purchasesFrom([
    plan("a", "plan_active", "Active", "positive", "2026-10-01T10:00:00Z"),
    plan("b", "plan_active", "Active", "positive", "2026-10-02T10:00:00Z"),
    plan("c", "pending_approval", "Approval Pending", "warning", "2026-10-03T10:00:00Z"),
  ], PORTAL);
  assert.equal(purchasesLine(rows), "1 approval pending · 2 active");
  assert.equal(purchasesLine([]), "No purchases yet");
  assert.equal(purchasesLine(purchasesFrom([plan("d", "plan_closed", "Expired", "neutral", "2026-01-01T00:00:00Z")], PORTAL)), "1 purchase");
});

test("the My offers line: open reservations with the nearest deadline (India date), payments under review", () => {
  const now = Date.parse("2026-10-30T06:00:00Z");
  const rows = [
    { status: "reserved", deadline: "2026-11-05T04:30:00Z", expiresAt: "2026-11-02T04:30:00Z" },
    { status: "reserved", deadline: "2026-11-01T20:00:00Z", expiresAt: "2026-11-01T20:00:00Z" }, // 2 Nov in India
    { status: "reserved", deadline: "2026-10-29T00:00:00Z", expiresAt: "2026-10-29T00:00:00Z" }, // already past
    { status: "under_review", expiresAt: "2026-10-31T00:00:00Z" },
    { status: "confirmed", expiresAt: "2026-10-31T00:00:00Z" },
  ];
  assert.equal(offersLine(rows, now), "2 reserved · pay by 2 Nov · 1 payment under review");
  assert.equal(offersLine([{ status: "confirmed", expiresAt: "2026-10-31T00:00:00Z" }], now), "Nothing to do");
  assert.equal(offersLine([], now), "No reserved offers");
});
