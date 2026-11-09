import { CYCLE_MONTHS } from "@/lib/public-plans";
import type { PackageCycle, PackageMonthly } from "@/lib/sales-packages";

/**
 * A price-per-file package, worked out for the ADMIN form only (owner decision 9 Nov 2026): one update =
 * files × price per file, one month = one update × updates a month, one billing period = months × that,
 * less the cycle discount. It is the backend's own maths (helpers/salesPackages.js monthlyQuote →
 * servicePlanPricing.js quoteServicePlan, no cheaper slabs for packages); tests/package-per-file.test.ts
 * runs both on many choices and fails if they ever differ. What a customer pays always comes from the
 * backend quote (customize page), never from here.
 */
export type PerFileChoice = { billingCycle: PackageCycle; tenureMonths: number; files: number; updates: number };
export type PerFileQuote = { updatePrice: number; perMonthPrice: number; cycleMonths: number; discountPercent: number; subtotal: number; discount: number; cyclePrice: number; totalCycles: number; totalPrice: number };

const rupees = (amount: number) => Math.round(Number(amount) || 0);

/** One update with `files` files. */
export const updatePrice = (rate: number, files: number) => rupees(files * rate);

export function perFileQuote(rate: number, monthly: PackageMonthly, choice: PerFileChoice): PerFileQuote {
  const option = monthly.billingOptions.find(row => row.billingCycle === choice.billingCycle);
  const cycleMonths = CYCLE_MONTHS[choice.billingCycle];
  const discountPercent = Number(option?.discountPercent || 0);
  const update = updatePrice(rate, choice.files);
  const perMonth = update * choice.updates;
  const subtotal = rupees(perMonth * cycleMonths);
  const cyclePrice = rupees(perMonth * cycleMonths * (1 - discountPercent / 100));
  const totalCycles = choice.tenureMonths / cycleMonths;
  return { updatePrice: update, perMonthPrice: rupees(perMonth), cycleMonths, discountPercent, subtotal, discount: subtotal - cyclePrice, cyclePrice, totalCycles, totalPrice: cyclePrice * totalCycles };
}

/** Whether the files and updates ranges can be priced (the form reports what is wrong). */
export function perFileReady(rate: number, monthly: PackageMonthly | undefined): monthly is PackageMonthly & Required<Pick<PackageMonthly, "files" | "updatesPerMonth">> {
  const f = monthly?.files, u = monthly?.updatesPerMonth;
  return !!monthly && rate > 0 && !!f && !!u && f.min >= 1 && f.max >= f.min && f.step >= 1 && (f.max - f.min) % f.step === 0
    && u.min >= 1 && u.max >= u.min && monthly.billingOptions.length > 0;
}

/** The choices the admin's price check offers: ticked cycles, lengths that fit, files in steps, updates. */
export function perFileChoices(monthly: PackageMonthly & Required<Pick<PackageMonthly, "files" | "updatesPerMonth">>) {
  const cycles = monthly.billingOptions.map(row => row.billingCycle).filter(cycle => CYCLE_MONTHS[cycle] <= monthly.maxTenureMonths);
  const files: number[] = [];
  for (let n = monthly.files.min; n <= monthly.files.max && files.length < 200; n += monthly.files.step) files.push(n);
  const updates: number[] = [];
  for (let n = monthly.updatesPerMonth.min; n <= monthly.updatesPerMonth.max; n++) updates.push(n);
  const lengths = (cycle: PackageCycle) => { const months = CYCLE_MONTHS[cycle]; const out: number[] = []; for (let n = months; n <= monthly.maxTenureMonths; n += months) out.push(n); return out; };
  return { cycles, files, updates, lengths };
}
