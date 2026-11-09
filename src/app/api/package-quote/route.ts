import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { packageQuoteSchema } from "@/lib/package-choice";
import { salesBackend } from "@/lib/sales-catalogue-server";

// The package customize page (/package/<id>/customize, src/docs/package.md §3). The portal backend prices
// the choice (helpers/salesPackages.js quoteChoice); this route only checks the request's shape and
// forwards it with the website's integration key. Nothing can be bought here.
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = packageQuoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose the package options again." }, { status: 400 });
    return NextResponse.json(await salesBackend(false, parsed.data, "sales-packages/quote"), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
