// Project categories are owned by the portal (backend helpers/projectCategories.js) and arrive with
// the sales catalogue; the website never hardcodes them. A key is permanent once created.
export const PROJECT_CATEGORY_KEY = /^[a-z][a-z0-9_]{2,39}$/;
export type ProjectCategory = { category: string; label: string; status?: "active" | "archived"; sortOrder?: number };
export type SalesPackage = {
  id: string; name: string; description: string; status: "draft" | "published" | "archived";
  category: string; regularPrice: number; discountedPrice: number; offerExtraPrice: number;
  offerSlug: string; inclusions: string[]; terms: string[]; linkedPlanIds: string[]; order: number;
  /** Website package pages (lib/package-pages.ts) this package is shown on. Missing on packages saved before pages existed. */
  pages?: string[];
  /** The design of its page /package/<id> (lib/package-design.ts). Missing on packages saved before 7 Nov 2026. */
  design?: import("./package-design").PackageDesign;
};
export type SalesOffer = import("./offers").Offer & { resolvedTerms: string[]; quoteKey: string };
export type QuotedPackage = SalesPackage & { quoteKey: string; quote: { regularPrice: number; discountAmount: number; finalPrice: number; offer: SalesOffer | null; terms: string[] } };
/** A package's working copy (backend helpers/packageDrafts.js): the form as typed, checked only when published. */
export type PackageDraft = { packageId: string; name: string; data: { item: Record<string, unknown>; offer?: Record<string, unknown> | null }; version: number; updatedAt?: string };
export type SalesCatalogue = { packages: QuotedPackage[]; offers?: SalesOffer[]; plans?: { _id: string; serviceName: string; servicePlan?: { purchaseType?: string; capability?: string } }[]; categories?: ProjectCategory[]; drafts?: PackageDraft[] };

export const categoryLabel = (categories: ProjectCategory[] | undefined, key: string) =>
  categories?.find(entry => entry.category === key)?.label ?? key;

// Choices for an editor: active categories, plus any already selected one (e.g. archived since).
export const categoryChoices = (categories: ProjectCategory[] | undefined, selected: string[]): ProjectCategory[] => {
  const list = (categories || []).filter(entry => entry.status !== "archived" || selected.includes(entry.category));
  const missing = selected.filter(key => !list.some(entry => entry.category === key)).map(key => ({ category: key, label: key }));
  return [...list, ...missing];
};
