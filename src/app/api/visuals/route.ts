import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { visualSchema } from "@/lib/visual-validation";
import { activeVisualSlots } from "@/lib/visual-config";
import { prepareVisualWrites } from "@/lib/visual-save";

const requestSchema = z.object({ slot: z.string(), config: visualSchema }).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const { slot, config: input } = requestSchema.parse(await request.json());
    const [settings, assets] = await Promise.all([settingsRepo.get(), input.assetId ? mediaRepo.findByIds([input.assetId]) : Promise.resolve([])]);
    const config = prepareVisualWrites({ [slot]: input }, activeVisualSlots(settings).map(slot => slot.id), assets)[slot];
    await settingsRepo.updateVisual(slot, config);
    return NextResponse.json(config);
  } catch (error) { return errorResponse(error); }
}
