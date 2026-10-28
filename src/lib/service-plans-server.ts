import "server-only";
import { salesBackend } from "@/lib/sales-catalogue-server";
import type { PlanCatalogue } from "@/lib/service-plans";

// The admin plan catalogue as the website admin sees it: plans + plan categories from the portal
// backend, plus project categories (for "link to a project category"). Admin cookie only.
export async function readPlanCatalogue(): Promise<PlanCatalogue> {
  return await salesBackend(true, undefined, "plan-catalogue") as PlanCatalogue;
}
