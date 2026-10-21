import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { readSalesCatalogue, salesBackend } from "@/lib/sales-catalogue-server";
export async function GET() {
  try { return NextResponse.json(await readSalesCatalogue(true), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try { requireSameOrigin(request); return NextResponse.json(await salesBackend(true, await request.json())); }
  catch (error) { return errorResponse(error); }
}
