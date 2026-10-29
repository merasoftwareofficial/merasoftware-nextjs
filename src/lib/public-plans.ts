/**
 * The public plans page (/plans, "Pricing & Packages" menu; docs/plan.md §0.2 P6). Marketing only:
 * plans are bought in the client portal. Every price comes from the portal backend
 * (GET /api/integration/plan-catalogue → publicPlan() in controller/order/servicePlanQuote.js,
 * and the estimator's PATCH /api/integration/plan-catalogue/quote); this file only lists the
 * choices a plan offers so the estimator can show them. The portal builder lists the same
 * choices in frontend/src/helpers/serviceTenure.js.
 */

import { z } from "zod";
import { slugify } from "@/lib/slug";

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
  limitScope?: string;
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
  releaseMode?: ReleaseMode;
};
export type ReleaseMode = "all_at_once" | "monthly";

export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
export const PURCHASE_LABELS: Record<"one_time" | BillingCycle, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "6 months", yearly: "Yearly" };

const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
export const formatMoney = money;

export function rangeLabel(range: PriceRange | null): string {
  if (!range || !(range.from > 0)) return "";
  // A range shows only its lowest price, never the top of the range.
  const amount = range.to > range.from ? `From ${money(range.from)}` : money(range.from);
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
  releaseMode: z.enum(["all_at_once", "monthly"]).optional(),
}).strict();
export type PlanQuoteRequest = z.infer<typeof planQuoteSchema>;

/**
 * "Get this plan" by a non-client (/api/plan-request): the same choice plus how to reach the person.
 * A signed-in member sends only the choice (and a phone if the account has none); a visitor sends
 * name, email and phone. `website` is the hidden trap field (as the subscribe form's): a bot fills it.
 * The portal backend checks everything again (controller/lead/planRequest.js).
 */
export const planRequestSchema = planQuoteSchema.extend({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(120).optional(),
  countryCode: z.string().regex(/^\+\d{1,4}$/).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  website: z.string().max(200).optional(),
}).strict();
export type PlanRequest = z.infer<typeof planRequestSchema>;

// --- One plan's own page (/plans/<name>-<id>): the builder's choices, same order and wording as the
// portal builder (frontend/src/components/PlanBuilder.js). Prices still come only from the backend quote.

export const PERIOD_WORDS: Record<BillingCycle, string> = { monthly: "month", quarterly: "3 months", half_yearly: "6 months", yearly: "year" };
export const BUY_WORDS: Record<"one_time" | BillingCycle, string> = { one_time: "one-time", monthly: "monthly", quarterly: "every 3 months", half_yearly: "every 6 months", yearly: "yearly" };
export const tenureLabel = (months: number) => (months === 12 ? "1 year" : `${months} month${months === 1 ? "" : "s"}`);

/** The plan's page: a readable name for search engines, the id for finding it (a rename keeps old links working). */
export function planPagePath(plan: Pick<PublicPlan, "_id" | "serviceName">) {
  return `${PLANS_PAGE_PATH}/${slugify(plan.serviceName) || "plan"}-${plan._id}`;
}
/** The plan id at the end of a /plans/<segment> address, or null. */
export function planIdFromSegment(segment: string) {
  return /(?:^|-)([a-f0-9]{24})$/.exec(segment)?.[1] ?? null;
}

/** One line on the card: what the plan gives (as in the portal's cards). */
export function planBenefit(plan: PublicPlan): string {
  if (plan.capability === "send_reminders") return "We do the work and post updates for you. No file uploads needed.";
  if (plan.pricingMode === "flexible") return "Choose files per update and how many updates you need.";
  if (plan.limitScope === "unlimited") return `Unlimited updates${plan.filesLimit ? ` · up to ${plan.filesLimit} files each` : ""}`;
  const scopes: Record<string, string> = { per_day: "per day", per_week: "per week", per_month: "per month", per_quarter: "per 3 months", per_6_month: "per 6 months", per_year: "per year", per_plan: "per purchase" };
  const period = plan.purchaseType === "one_time" ? "per purchase" : scopes[plan.limitScope || ""] || "in this plan";
  const allowance = plan.portalAccessCount ? `${plan.portalAccessCount} update${plan.portalAccessCount === 1 ? "" : "s"} ${period}` : "";
  return [allowance, plan.filesLimit ? `up to ${plan.filesLimit} files each` : ""].filter(Boolean).join(" · ");
}

/** At most five quick picks for files, only those inside the plan's range and on its step. */
export function filePresets(plan: PublicPlan): number[] {
  if (plan.pricingMode !== "flexible" || !plan.files) return [];
  const { min, max } = plan.files;
  const step = plan.files.step || 1;
  return [10, 20, 40, 60, 90].filter(value => value >= min && value <= max && (value - min) % step === 0);
}

/** The plan's own per-file rates (marginal slabs), for reading only. */
export function slabRows(plan: PublicPlan): { from: number; to: number; rate: number }[] {
  if (plan.pricingMode !== "flexible" || !plan.files || !(plan.ratePerFile! > 0)) return [];
  const rows = [{ from: 1, rate: plan.ratePerFile! }, ...[...(plan.slabs || [])].sort((a, b) => a.fromFile - b.fromFile).map(slab => ({ from: slab.fromFile, rate: slab.ratePerFile }))];
  return rows.map((row, index) => ({ ...row, to: index + 1 < rows.length ? rows[index + 1].from - 1 : plan.files!.max }));
}

/** Whether the customer may choose how updates open: only on a plan that allows it, for periods longer than a month. */
export const canChooseRelease = (plan: PublicPlan, cycleMonths: number | null) => plan.customerCanChooseRelease && Number(cycleMonths) > 1;

export type PlanChoice = { purchase: "one_time" | BillingCycle; tenureMonths: number | null; files: number | null; updates: number | null; releaseMode: ReleaseMode };

/**
 * The builder's starting choice: the plan's defaults (as the portal builder), or the visitor's own
 * choice carried in the address (e.g. back from sign-in) when every part is one this plan offers.
 */
export function initialChoice(plan: PublicPlan, query: Record<string, string | string[] | undefined> = {}): PlanChoice | null {
  const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const purchases = purchaseChoices(plan);
  if (!purchases.length) return null;
  const purchase = purchases.find(option => option.value === read("purchase")) ?? purchases[0];
  const lengths = lengthChoices(plan, purchase.months);
  const files = fileChoices(plan);
  const updates = updateChoices(plan);
  const pick = (values: number[], raw: string, fallback: number | null) => (values.includes(Number(raw)) ? Number(raw) : fallback);
  const release = read("release");
  return {
    purchase: purchase.value,
    tenureMonths: pick(lengths, read("months"), purchase.months),
    files: pick(files, read("files"), files[0] ?? null),
    updates: pick(updates, read("updates"), updates[0] ?? null),
    releaseMode: canChooseRelease(plan, purchase.months) && (release === "monthly" || release === "all_at_once") ? release : plan.releaseMode,
  };
}

/** The choice as an address query, so it survives sign-in. */
export function choiceQuery(plan: PublicPlan, choice: PlanChoice) {
  const request = quoteRequest(plan, choice);
  const query = new URLSearchParams({ purchase: request.purchase });
  if (request.tenureMonths) query.set("months", String(request.tenureMonths));
  if (request.files) query.set("files", String(request.files));
  if (request.updates) query.set("updates", String(request.updates));
  if (request.releaseMode) query.set("release", request.releaseMode);
  return query.toString();
}

/** The backend quote request for a choice: only the parts this plan and purchase use. */
export function quoteRequest(plan: PublicPlan, choice: PlanChoice): PlanQuoteRequest {
  const oneTime = choice.purchase === "one_time";
  const flexible = plan.pricingMode === "flexible";
  const cycleMonths = oneTime ? null : CYCLE_MONTHS[choice.purchase as BillingCycle];
  return {
    planId: plan._id,
    purchase: choice.purchase,
    ...(oneTime || !choice.tenureMonths ? {} : { tenureMonths: choice.tenureMonths }),
    ...(flexible && choice.files ? { files: choice.files } : {}),
    ...(flexible && choice.updates ? { updates: choice.updates } : {}),
    ...(canChooseRelease(plan, cycleMonths) ? { releaseMode: choice.releaseMode } : {}),
  };
}

/** A short reading of the choice, e.g. "20 files × 4 updates, every 3 months for 1 year". */
export function choiceSummary(plan: PublicPlan, choice: PlanChoice) {
  const oneTime = choice.purchase === "one_time";
  const what = plan.pricingMode === "flexible" ? `${choice.files} files × ${choice.updates} update${choice.updates === 1 ? "" : "s"}, ` : "";
  return `${what}${BUY_WORDS[choice.purchase]}${!oneTime && choice.tenureMonths ? ` for ${tenureLabel(choice.tenureMonths)}` : ""}`;
}

/** A plan description (stored as HTML) as plain text. */
export const plainText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The plan page's built-in search description: its own description, else what it gives (editable at /admin/page-seo). */
export function planSeoDescription(plan: PublicPlan) {
  const text = plainText(plan.description || "") || [planBenefit(plan), "Customize the plan and see its price."].filter(Boolean).join(". ");
  return text.length <= 160 ? text : `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
