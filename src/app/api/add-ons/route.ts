import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { portalAddOnRequest, readSalesCatalogue, requireSalesAdmin } from "@/lib/sales-catalogue-server";
import { removeAddOn, saveAddOn, type AddOnDeps } from "@/lib/add-ons";

// Add-on services (Additional Features / Upgrades) are managed from the package form, where a package is priced from
// them. The portal backend owns every rule and the prices; lib/add-ons.ts checks the shape, that an edited or removed
// service really is an add-on (the portal's product routes would take any product) and the categories, then this
// forwards with the admin's own login. The package form reads the list again afterwards (GET /api/packages).
const deps: AddOnDeps = { catalogue: () => readSalesCatalogue(true), forward: portalAddOnRequest };
async function run(request: Request, handle: typeof saveAddOn) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const result = await handle(await request.json().catch(() => null), deps);
    return NextResponse.json(result.body, { status: result.status });
  }
  catch (error) { return errorResponse(error); }
}
export const POST = (request: Request) => run(request, saveAddOn);
export const DELETE = (request: Request) => run(request, removeAddOn);
