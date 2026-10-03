import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requirePortfolioIntegration } from "@/lib/portfolio/integration-auth";
import { sourceSchema } from "@/lib/portfolio/rules";
import { portfolioRepo } from "@/lib/portfolio/repo";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requirePortfolioIntegration(request);
    if (Number(request.headers.get("content-length")) > 256_000) return NextResponse.json({ error: "Batch too large." }, { status: 413 });
    const { sources } = z.object({ sources: z.array(sourceSchema).min(1).max(100) }).parse(await request.json());
    for (const source of sources) await portfolioRepo.sync(source);
    return NextResponse.json({ success: true, received: sources.length });
  } catch (error) { return errorResponse(error); }
}
