// Project categories are owned by the portal (backend helpers/projectCategories.js) and arrive with
// the sales catalogue; the website never hardcodes them. A key is permanent once created.
export const PROJECT_CATEGORY_KEY = /^[a-z][a-z0-9_]{2,39}$/;
export type ProjectCategory = { category: string; label: string; status?: "active" | "archived"; sortOrder?: number;
  /** What the package form needs from the portal: the base price a package is priced from, and what its dialog edits and warns about. */
  basePrice?: number | null; description?: string; startingNodeTitle?: string; customerSelectable?: boolean; locked?: boolean; usage?: { projects: number; features: number; packages: number } };
export type SalesPackage = {
  id: string; name: string; description: string; status: "draft" | "published" | "archived";
  category: string; regularPrice: number; discountedPrice: number; offerExtraPrice: number;
  offerSlug: string; inclusions: string[]; terms: string[]; linkedPlanIds: string[]; order: number;
  /** Website package pages (lib/package-pages.ts) this package is shown on. Missing on packages saved before pages existed. */
  pages?: string[];
  /** The design of its page /package/<id> (lib/package-design.ts). Missing on packages saved before 7 Nov 2026. */
  design?: import("./package-design").PackageDesign;
  /** How a customer buys it (src/docs/package.md decision 7). All three or none: missing on packages saved
   * before 8 Nov 2026, which keep working as before until the admin chooses them. */
  billing?: PackageBilling; portalUploads?: boolean; paymentOptions?: PackagePaymentOption[];
  /** A monthly package's pricing (package.md decision 9); its prices are then a monthly price or a rate per file. */
  monthly?: PackageMonthly;
  /** One-time packages priced from their category and add-ons (backend helpers/salesPackages.js, 10 Nov 2026): the add-ons chosen
   * (what the form sends) and the prices frozen when it was saved (read only; the backend ignores a copy sent back).
   * Missing on packages priced by hand. */
  services?: ServiceChoice[]; pricing?: PricingSnapshot;
};
export type ServiceChoice = { featureId: string; quantity: number };
export type PricingSnapshot = { categoryBasePrice: number; services: { featureId: string; name: string; unitPrice: number; isQuantityBased: boolean; quantity: number }[] };
/** An add-on service of the portal catalogue (Additional Features / Upgrades) a package can be priced from. */
export type AddOn = { id: string; name: string; unitPrice: number; description: string; isHidden: boolean; isQuantityBased: boolean; compatibleWith: string[] };
export type PackageBilling = "one_time" | "monthly";
export type PackagePaymentOption = "full" | "installments_2" | "installments_3";
export type PackageCycle = import("./public-plans").BillingCycle;
export type PackageMonthly = {
  pricing: "fixed" | "per_file"; billingOptions: { billingCycle: PackageCycle; discountPercent: number }[]; maxTenureMonths: number;
  files?: { min: number; max: number; step: number }; updatesPerMonth?: { min: number; max: number };
};
/** What a customer chooses on /package/<id>/customize (backend helpers/salesPackages.js quoteChoice). */
export type PackageChoice = { paymentOption?: PackagePaymentOption; billingCycle?: PackageCycle; tenureMonths?: number; files?: number | null; updates?: number | null };
export type PackageChoiceQuote = {
  packageId: string; billing: PackageBilling; quoteKey: string; regularPrice: number; discountAmount: number; finalPrice: number; dueNow: number;
  offer: { slug: string; title: string; endsAt: string } | null;
  paymentOption?: PackagePaymentOption; installments?: { installmentNumber: number; percentage: number; amount: number; progressThreshold: number | null }[];
  monthly?: { billingCycle: PackageCycle; cycleMonths: number; tenureMonths: number; totalCycles: number; pricing: "fixed" | "per_file";
    files: number | null; updatesPerMonth: number | null; perMonthPrice: number; discountPercent: number; cyclePrice: number; totalPrice: number };
};
export const MONTHLY_PRICING_LABELS: Record<PackageMonthly["pricing"], string> = { fixed: "Fixed monthly price", per_file: "Price per file" };
/** What the package's price means: a one-time price, a monthly price, or a rate per file. */
export const priceUnit = (item: Pick<SalesPackage, "billing" | "monthly">) =>
  item.billing !== "monthly" ? "one-time" : item.monthly?.pricing === "per_file" ? "per file" : "/ month";
export const billingLabel = (item: Pick<SalesPackage, "billing">) => (item.billing === "monthly" ? "Monthly" : "One-time");
/** A package with its purchase settings has a customize page (package.md decision 15). */
export const customizable = (item: Pick<SalesPackage, "billing">) => !!item.billing;
export const packageCustomizePath = (id: string) => `/package/${encodeURIComponent(id)}/customize`;
export const PACKAGE_PAYMENT_OPTIONS: { value: PackagePaymentOption; label: string }[] = [
  { value: "full", label: "Full payment" },
  { value: "installments_2", label: "2 installments (50% + 50%)" },
  { value: "installments_3", label: "3 installments (30% + 30% + 40%)" },
];
export type SalesOffer = import("./offers").Offer & { resolvedTerms: string[]; quoteKey: string };
export type QuotedPackage = SalesPackage & { quoteKey: string; quote: { regularPrice: number; discountAmount: number; finalPrice: number; offer: SalesOffer | null; terms: string[] } };
/** A package's working copy (backend helpers/packageDrafts.js): the form as typed, checked only when published. */
export type PackageDraft = { packageId: string; name: string; data: { item: Record<string, unknown>; offer?: Record<string, unknown> | null }; version: number; updatedAt?: string };
export type SalesCatalogue = { packages: QuotedPackage[]; offers?: SalesOffer[]; plans?: { _id: string; serviceName: string; servicePlan?: { purchaseType?: string; capability?: string } }[]; categories?: ProjectCategory[]; addOns?: AddOn[]; drafts?: PackageDraft[] };

export const categoryLabel = (categories: ProjectCategory[] | undefined, key: string) =>
  categories?.find(entry => entry.category === key)?.label ?? key;

// Choices for an editor: active categories, plus any already selected one (e.g. archived since).
export const categoryChoices = (categories: ProjectCategory[] | undefined, selected: string[]): ProjectCategory[] => {
  const list = (categories || []).filter(entry => entry.status !== "archived" || selected.includes(entry.category));
  const missing = selected.filter(key => !list.some(entry => entry.category === key)).map(key => ({ category: key, label: key }));
  return [...list, ...missing];
};
