import { z } from "zod";
import { CYCLE_MONTHS, type BillingCycle } from "@/lib/public-plans";
import type { PackageChoice, PackagePaymentOption, SalesPackage } from "@/lib/sales-packages";

/**
 * A package's customize page (/package/<id>/customize, src/docs/package.md §3): what the customer may
 * choose, worked out from the package's own settings. The portal backend checks and prices every choice
 * (helpers/salesPackages.js quoteChoice); nothing here is a price.
 */
export const packageChoiceSchema = z.object({
  paymentOption: z.enum(["full", "installments_2", "installments_3"]).optional(),
  billingCycle: z.enum(["monthly", "quarterly", "half_yearly", "yearly"]).optional(),
  tenureMonths: z.number().int().min(1).max(12).optional(),
}).strict();
export const packageQuoteSchema = z.object({ packageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), choice: packageChoiceSchema }).strict();
export type PackageQuoteRequest = z.infer<typeof packageQuoteSchema>;

export const PAYMENT_OPTION_WORDS: Record<PackagePaymentOption, { title: string; detail: string }> = {
  full: { title: "Full payment", detail: "pay once" },
  installments_2: { title: "2 installments", detail: "50% + 50%" },
  installments_3: { title: "3 installments", detail: "30% + 30% + 40%" },
};

type Pkg = Pick<SalesPackage, "billing" | "paymentOptions" | "monthly">;
/** Billing cycles the package offers, shortest first. */
export const cycleChoices = (item: Pkg) => (item.monthly?.billingOptions ?? [])
  .filter(option => CYCLE_MONTHS[option.billingCycle] <= Math.min(item.monthly!.maxTenureMonths, 12))
  .sort((a, b) => CYCLE_MONTHS[a.billingCycle] - CYCLE_MONTHS[b.billingCycle]);
/** Lengths for a cycle: whole cycles up to the package's maximum (as the plan builder). */
export function lengthChoicesFor(item: Pkg, cycle: BillingCycle | undefined) {
  const months = cycle ? CYCLE_MONTHS[cycle] : 0;
  const max = Math.min(item.monthly?.maxTenureMonths ?? 12, 12);
  const out: number[] = [];
  for (let value = months; months && value <= max; value += months) out.push(value);
  return out;
}
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** The first choice: from the address (?pay=… or ?cycle=…&months=…) when valid, else the first option. */
export function initialPackageChoice(item: Pkg, query: Record<string, string | string[] | undefined> = {}): PackageChoice | null {
  if (item.billing === "one_time") {
    const options = item.paymentOptions ?? [];
    const asked = one(query.pay) as PackagePaymentOption | undefined;
    return options.length ? { paymentOption: asked && options.includes(asked) ? asked : options[0] } : null;
  }
  if (item.billing !== "monthly") return null;
  const cycles = cycleChoices(item);
  if (!cycles.length) return null;
  const askedCycle = cycles.find(option => option.billingCycle === one(query.cycle))?.billingCycle ?? cycles[0].billingCycle;
  const lengths = lengthChoicesFor(item, askedCycle);
  const askedMonths = Number(one(query.months));
  return { billingCycle: askedCycle, tenureMonths: lengths.includes(askedMonths) ? askedMonths : lengths[lengths.length - 1] };
}
/** The choice in the address, so sign-in brings the customer back to the same choice. */
export function packageChoiceQuery(choice: PackageChoice) {
  const params = new URLSearchParams();
  if (choice.paymentOption) params.set("pay", choice.paymentOption);
  if (choice.billingCycle) params.set("cycle", choice.billingCycle);
  if (choice.tenureMonths) params.set("months", String(choice.tenureMonths));
  return params.toString();
}
/** Only the fields the package's billing uses. */
export const cleanPackageChoice = (item: Pkg, choice: PackageChoice): PackageChoice => item.billing === "monthly"
  ? { billingCycle: choice.billingCycle, tenureMonths: choice.tenureMonths }
  : { paymentOption: choice.paymentOption };
