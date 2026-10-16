import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { slotInfo } from "@/lib/visual-slots";
import { visualSchema, normaliseVisual } from "@/lib/visual-validation";

const requestSchema = z.object({ slot: z.string(), config: visualSchema }).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const { slot, config } = requestSchema.parse(await request.json());
    if (!slotInfo(slot)) return NextResponse.json({ error: "Unknown website visual slot." }, { status: 400 });
    const asset = config.assetId ? await mediaRepo.findById(config.assetId) : null;
    if (config.assetId && !asset) return NextResponse.json({ error: "Choose media from the library." }, { status: 400 });
    normaliseVisual(config, asset);
    if (slot === "home.hero" && config.frameShape === "source" && asset?.kind !== "video") config.frameShape = "slot";
    await settingsRepo.updateVisual(slot, config);
    return NextResponse.json(config);
  } catch (error) { return errorResponse(error); }
}
