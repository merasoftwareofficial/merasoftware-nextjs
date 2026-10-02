import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { slotInfo } from "@/lib/visual-slots";
import { VISUAL_PATTERN_IDS } from "@/lib/visual-patterns";

const visualSchema = z.object({
  mode: z.enum(["pattern", "media", "both"]),
  assetId: z.string().optional(),
  pattern: z.enum(["default", ...VISUAL_PATTERN_IDS]),
  intensity: z.number().min(0).max(100),
  fit: z.enum(["contain", "cover"]),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
  alt: z.string().trim().max(300),
}).strict();
const requestSchema = z.object({ slot: z.string(), config: visualSchema }).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const { slot, config } = requestSchema.parse(await request.json());
    if (!slotInfo(slot)) return NextResponse.json({ error: "Unknown website visual slot." }, { status: 400 });
    if (config.assetId && !(await mediaRepo.findById(config.assetId))) return NextResponse.json({ error: "Choose media from the library." }, { status: 400 });
    if (!config.assetId && config.mode !== "pattern") config.mode = "pattern";
    const settings = await settingsRepo.get();
    const next = { ...settings.sectionVisuals, [slot]: config };
    if (slot === "home.hero" && settings.homepageImages?.hero) {
      const homepageImages = { ...settings.homepageImages };
      delete homepageImages.hero;
      await settingsRepo.update({ sectionVisuals: next, homepageImages });
    } else {
      await settingsRepo.update({ sectionVisuals: next });
    }
    return NextResponse.json(config);
  } catch (error) { return errorResponse(error); }
}
