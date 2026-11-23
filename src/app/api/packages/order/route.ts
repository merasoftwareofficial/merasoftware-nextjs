import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { requireSalesAdmin, salesBackend } from "@/lib/sales-catalogue-server";
import { invalidatePublicPages } from "@/lib/public-cache";

const requestSchema = z.object({
  packageId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  order: z.number().int().min(0).max(9999),
}).strict();

// Lightweight transport boundary for inline list priority updates: only the
// package ID and integer display order are forwarded to the portal SSOT.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await requireSalesAdmin();
    const input = requestSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Enter a whole priority number from 0 to 9999." }, { status: 400 });
    const result = await salesBackend(true, input.data, "sales-packages/order");
    invalidatePublicPages();
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
