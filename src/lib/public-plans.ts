/**
 * The public plans page (/plans, "Pricing & Packages" menu; docs/plan.md §0.2 P6). Marketing only:
 * plans are bought in the client portal. Every price comes from the portal backend
 * (GET /api/integration/plan-catalogue → publicPlan() in controller/order/servicePlanQuote.js,
 * and the estimator's PATCH /api/integration/plan-catalogue/quote); this file only lists the
 * choices a plan offers so the estimator can show them. The portal builder lists the same
 * choices in frontend/src/helpers/serviceTenure.js.
 */

import { z } from "zod";

export const PLANS_PAGE_PATH = "/plans";
export const PLANS_PAGE_TITLE = "Plans";
export const PLANS_PAGE_INTRO = "Ongoing website and business work on a plan: choose how many updates you need and for how long. You buy and manage a plan in your client portal.";

export type PriceRange = { unit: "update" | "month" | "one_time"; from: number; to: number };
export type BillingCycle = "monthly" | "quarterly" | "half_yearly" | "yearly";
export type PublicPlan = {
  _id: string;
  serviceName: string;
  description: string;
  categoryKey: string | null;
  priceRange: PriceRange | null;
  pricingMode: "fixed" | "flexible";
  capability?: "upload_data" | "send_reminders";
  purchaseType?: "one_time" | "recurring";
  files?: { min: number; max: number; step?: number };
  ratePerFile?: number;
  slabs?: { fromFile: number; ratePerFile: number }[];
  updatesPerMonth?: { min: number; max: number };
  filesLimit?: number;
  portalAccessCount?: number;
  allowOneTime: boolean;
  oneTimeValidityDays: number | null;
  maxTenureMonths: number;
  billingOptions: { billingCycle: BillingCycle; discountPercent: number }[];
  releaseMode: "all_at_once" | "monthly";
  customerCanChooseRelease: boolean;
};
export type PlanCategory = { key: string; label: string; description?: string; sortOrder?: number };
export type PublicPlanCatalogue = { plans: PublicPlan[]; categories: PlanCategory[] };
export type PlanQuote = {
  purchase: "one_time" | BillingCycle; files: number | null; updates: number | null; updatePrice: number | null;
  perMonthPrice?: number; cycleMonths: number | null; tenureMonths: number | null; totalCycles: number;
  discountPercent: number; discount: number; subtotal: number; cyclePrice: number; totalPrice: number;
  firstPayment: number; allowancePerCycle: number | null; validityDays: number | null;
};

export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
export const PURCHASE_LABELS: Record<"one_time" | BillingCycle, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "6 months", yearly: "Yearly" };

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
export const formatMoney = money;

export function rangeLabel(range: PriceRange | null): string {
  if (!range || !(range.from > 0)) return "";
  const amount = range.to > range.from ? `${money(range.from)} – ${money(range.to)}` : money(range.from);
  return `${amount} ${range.unit === "update" ? "/ update" : range.unit === "month" ? "/ month" : "one-time"}`;
}

/** The ways a plan can be bought, shortest first, within its own maximum length. */
export function purchaseChoices(plan: PublicPlan): { value: "one_time" | BillingCycle; months: number | null; discountPercent: number }[] {
  const max = Math.min(plan.maxTenureMonths || 12, 12);
  const recurring = plan.billingOptions
    .filter(option => CYCLE_MONTHS[option.billingCycle] && CYCLE_MONTHS[option.billingCycle] <= max)
    .sort((a, b) => CYCLE_MONTHS[a.billingCycle] - CYCLE_MONTHS[b.billingCycle])
    .map(option => ({ value: option.billingCycle, months: CYCLE_MONTHS[option.billingCycle], discountPercent: option.discountPercent || 0 }));
  const oneTime = plan.allowOneTime ? [{ value: "one_time" as const, months: null, discountPercent: 0 }] : [];
  return [...oneTime, ...(plan.pricingMode === "flexible" || plan.purchaseType !== "one_time" ? recurring : [])];
}

/** Every whole number of periods up to the plan's maximum length. */
export function lengthChoices(plan: PublicPlan, cycleMonths: number | null): number[] {
  const max = Math.min(plan.maxTenureMonths || 12, 12);
  if (!cycleMonths || cycleMonths > max) return [];
  const out: number[] = [];
  for (let months = cycleMonths; months <= max; months += cycleMonths) out.push(months);
  return out;
}

export function fileChoices(plan: PublicPlan): number[] {
  if (plan.pricingMode !== "flexible" || !plan.files) return [];
  const step = plan.files.step || 1;
  const out: number[] = [];
  for (let value = plan.files.min; value <= plan.files.max; value += step) out.push(value);
  return out;
}

export function updateChoices(plan: PublicPlan): number[] {
  if (plan.pricingMode !== "flexible" || !plan.updatesPerMonth) return [];
  const { min, max } = plan.updatesPerMonth;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
}

/** The estimator's request, checked before it is forwarded to the portal backend. */
export const planQuoteSchema = z.object({
  planId: z.string().regex(/^[a-f0-9]{24}$/),
  purchase: z.enum(["one_time", "monthly", "quarterly", "half_yearly", "yearly"]),
  tenureMonths: z.number().int().min(1).max(12).optional(),
  files: z.number().int().min(1).max(100).optional(),
  updates: z.number().int().min(1).max(31).optional(),
}).strict();
export type PlanQuoteRequest = z.infer<typeof planQuoteSchema>;
