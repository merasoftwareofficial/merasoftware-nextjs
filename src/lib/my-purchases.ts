// My Account → My purchases (docs/plan.md §4, decision 11): what a client has bought, read from the
// portal backend's own order list (GET /api/get-order) and trimmed for the website. Status words and
// tone come from the backend status engine (orderStatusEngine.js), so they match the portal exactly.
// Plans only for now; projects and subscriptions join as new kinds, never as new tabs.

export type PurchaseTone = "neutral" | "positive" | "active" | "warning" | "danger";
export type Purchase = { id: string; kind: "plan"; name: string; status: string; code: string; tone: PurchaseTone; boughtAt: string | null; href: string };

/** The fields the website reads from one portal order (helpers/orderSummary.js ORDER_SUMMARY_FIELDS). */
export type PortalOrder = {
  _id: string; isServicePlan?: boolean; orderVisibility?: string; createdAt?: string;
  servicePlanSnapshot?: { serviceName?: string } | null;
  productId?: { serviceName?: string } | string | null;
  orderState?: { code?: string; label?: string; tone?: string } | null;
};

const TONES: PurchaseTone[] = ["neutral", "positive", "active", "warning", "danger"];

/** Bought plans, newest first, each linking to its own page in the portal. Hidden orders are left out. */
export function purchasesFrom(orders: PortalOrder[], portalUrl: string): Purchase[] {
  return orders
    .filter(order => order.isServicePlan && order.orderVisibility !== "hidden")
    .map(order => {
      const product = typeof order.productId === "object" ? order.productId : null;
      const tone = TONES.find(value => value === order.orderState?.tone) ?? "neutral";
      return {
        id: String(order._id), kind: "plan" as const,
        name: order.servicePlanSnapshot?.serviceName || product?.serviceName || "Plan",
        status: order.orderState?.label || "Processing", code: order.orderState?.code || "processing", tone,
        boughtAt: order.createdAt ?? null,
        href: `${portalUrl}/plan-details/${order._id}`,
      };
    })
    .sort((a, b) => Date.parse(b.boughtAt ?? "") - Date.parse(a.boughtAt ?? "") || 0);
}

const SUMMARY: [code: string, words: string][] = [
  ["pending_approval", "approval pending"], ["rejected", "payment rejected"], ["plan_active", "active"],
];

/** The Overview line, e.g. "1 active · 1 approval pending". Only states that matter to the client now. */
export function purchasesLine(rows: Purchase[]): string {
  if (!rows.length) return "No purchases yet";
  const parts = SUMMARY.map(([code, words]) => [rows.filter(row => row.code === code).length, words] as const)
    .filter(([count]) => count > 0).map(([count, words]) => `${count} ${words}`);
  return parts.length ? parts.join(" · ") : `${rows.length} ${rows.length === 1 ? "purchase" : "purchases"}`;
}

/** The Overview line for My offers: what still needs the client, nearest deadline first. */
export function offersLine(rows: { status: string; deadline?: string; expiresAt: string }[], now: number): string {
  const due = (row: { deadline?: string; expiresAt: string }) => Date.parse(row.deadline ?? row.expiresAt);
  const open = rows.filter(row => row.status === "reserved" && due(row) > now).sort((a, b) => due(a) - due(b));
  const review = rows.filter(row => row.status === "under_review").length;
  const parts: string[] = [];
  if (open.length) {
    const date = new Date(due(open[0])).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
    parts.push(`${open.length} reserved · pay by ${date}`);
  }
  if (review) parts.push(`${review} payment under review`);
  return parts.length ? parts.join(" · ") : rows.length ? "Nothing to do" : "No reserved offers";
}
