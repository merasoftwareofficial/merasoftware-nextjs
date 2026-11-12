import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { readSalesCatalogue } from "@/lib/sales-catalogue-server";
import { archiveRunningPackageOffers, restorePackageOffers } from "@/lib/package-offer-lifecycle";

const requestSchema = z.object({
  packageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  action: z.enum(["published", "archived"]),
}).strict();

// A small transport boundary: the portal reads the current package and applies
// its existing save rules. The browser never submits a stale package object.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const input = requestSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Choose a valid package action." }, { status: 400 });
    if (input.data.action === "published") return NextResponse.json(await salesBackend(true, input.data, "sales-packages/lifecycle"));
    const catalogue = await readSalesCatalogue(true);
    const item = catalogue.packages.find(row => row.id === input.data.packageId);
    if (!item) return NextResponse.json({ error: "Package not found. Refresh and try again." }, { status: 404 });
    const ended = await archiveRunningPackageOffers(item.id, item.offerSlug);
    try { return NextResponse.json(await salesBackend(true, input.data, "sales-packages/lifecycle")); }
    catch (error) {
      await restorePackageOffers(ended);
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}
