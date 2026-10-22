export const PROJECT_CATEGORIES = { standard_websites: "Standard Website", dynamic_websites: "Dynamic Website", cloud_software_development: "Cloud Software", app_development: "App Development" } as const;
export type SalesPackage = {
  id: string; name: string; description: string; status: "draft" | "published" | "archived";
  category: keyof typeof PROJECT_CATEGORIES; regularPrice: number; offerExtraPrice: number;
  offerSlug: string; inclusions: string[]; terms: string[]; linkedPlanIds: string[]; order: number;
};
export type SalesOffer = import("./offers").Offer & { resolvedTerms: string[]; quoteKey: string };
export type QuotedPackage = SalesPackage & { quoteKey: string; quote: { regularPrice: number; discountAmount: number; finalPrice: number; offer: SalesOffer | null; terms: string[] } };
export type SalesCatalogue = { packages: QuotedPackage[]; offers?: SalesOffer[]; plans?: { _id: string; serviceName: string; servicePlan?: { purchaseType?: string } }[] };
