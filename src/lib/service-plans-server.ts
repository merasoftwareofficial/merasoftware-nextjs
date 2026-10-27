import "server-only";
import { readSalesCatalogue, salesBackend } from "@/lib/sales-catalogue-server";
import type { PlanCatalogue, PlanCategory, StoredPlan } from "@/lib/service-plans";

// The admin plan catalogue as the website admin sees it: plans + plan categories from the portal
// backend, plus project categories (for "link to a project category"). Admin cookie only.
export async function readPlanCatalogue(): Promise<PlanCatalogue> {
  const [catalogue, categories, sales] = await Promise.all([
    salesBackend(true, undefined, "plan-catalogue") as Promise<{ plans: StoredPlan[] }>,
    salesBackend(true, undefined, "plan-categories") as Promise<PlanCategory[]>,
    readSalesCatalogue(true),
  ]);
  return { plans: catalogue.plans, categories, projectCategories: sales.categories || [] };
}
