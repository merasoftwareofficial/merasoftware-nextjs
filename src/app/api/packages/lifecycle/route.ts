import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { invalidateBackendOffersCache, readSalesCatalogue, requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { invalidatePublicPages } from "@/lib/public-cache";
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
    if (input.data.action === "published") {
      const result = await salesBackend(true, input.data, "sales-packages/lifecycle");
      invalidatePublicPages();
      return NextResponse.json(result);
    }
    const catalogue = await readSalesCatalogue(true);
    const item = catalogue.packages.find(row => row.id === input.data.packageId);
    if (!item) return NextResponse.json({ error: "Package not found. Refresh and try again." }, { status: 404 });
    const ended = await archiveRunningPackageOffers(item.id, item.offerSlug);
    if (ended.length) void invalidateBackendOffersCache();
    try {
      const result = await salesBackend(true, input.data, "sales-packages/lifecycle");
      invalidatePublicPages();
      return NextResponse.json(result);
    }
    catch (error) {
      await restorePackageOffers(ended);
      if (ended.length) void invalidateBackendOffersCache();
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}
