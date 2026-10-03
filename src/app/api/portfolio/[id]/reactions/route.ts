import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { portfolioRepo } from "@/lib/portfolio/repo";
import { isPublicPortfolio } from "@/lib/portfolio/types";
import { requireSameOrigin } from "@/lib/portfolio/integration-auth";
import { rateRepo } from "@/lib/repo";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const row = await portfolioRepo.find(id);
    if (!row || !isPublicPortfolio(row)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const user = await getSessionUser();
    return NextResponse.json(await portfolioRepo.reactions(id, user?._id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request); const user = await requireUser();
    const { id } = await context.params;
    const row = await portfolioRepo.find(id);
    if (!row || !isPublicPortfolio(row)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    if (!(await rateRepo.hit(`portfolio:${user._id}`, 30, 60_000))) return NextResponse.json({ error: "Please wait before reacting again." }, { status: 429 });
    const { reaction, active } = z.object({ reaction: z.enum(["like", "impressive"]), active: z.boolean() }).parse(await request.json());
    return NextResponse.json(await portfolioRepo.setReaction(id, user._id, reaction, active));
  } catch (error) { return errorResponse(error); }
}
