import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { salesBackend } from "@/lib/sales-catalogue-server";

// A package's working copy (src/docs/package-offers.md, owner decisions 7 Nov 2026): saved with only the
// package name (and the offer name when an offer was added). Nothing else is checked until it is published
// through PATCH /api/packages. The portal keeps it (backend helpers/packageDrafts.js).
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), packageId: z.string().optional(), version: z.number().int().min(0).optional(),
    data: z.object({ item: z.record(z.string(), z.unknown()), offer: z.record(z.string(), z.unknown()).nullable().optional() }) }).strict(),
  z.object({ action: z.literal("delete"), packageId: z.string(), version: z.number().int().min(1) }).strict(),
]);
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Reload the package and try again." }, { status: 400 });
    const input = parsed.data;
    if (input.action === "save") {
      if (typeof input.data.item.name !== "string" || !input.data.item.name.trim()) return NextResponse.json({ error: "Enter the package name to save a draft." }, { status: 400 });
      if (input.data.offer && (typeof input.data.offer.title !== "string" || !input.data.offer.title.trim())) return NextResponse.json({ error: "Enter the offer name to save the offer in the draft." }, { status: 400 });
    }
    return NextResponse.json(await salesBackend(true, input, "sales-packages/drafts"));
  }
  catch (error) { return errorResponse(error); }
}
