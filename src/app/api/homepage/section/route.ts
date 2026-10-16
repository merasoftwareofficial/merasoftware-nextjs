import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { homepageContentSchema } from "@/lib/homepage-content";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { sectionSlots } from "@/lib/visual-slots";
import { visualSchema } from "@/lib/visual-validation";
import { prepareVisualWrites } from "@/lib/visual-save";

const requestSchema = z.object({
  section: z.enum(["hero", "marquee", "services", "pointOfView", "work", "insights", "contact"]),
  content: z.unknown(),
  visuals: z.record(z.string(), visualSchema).default({}),
  images: z.record(z.string(), z.unknown()).default({}),
}).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const payload = requestSchema.parse(await request.json());
    const content = homepageContentSchema.shape[payload.section].parse(payload.content);
    if (Object.keys(payload.images).length) return NextResponse.json({ error: "Use the shared section visual controls. Legacy image editing has been retired." }, { status: 410 });
    const ids = [...new Set(Object.values(payload.visuals).flatMap(config => config.assetId ? [config.assetId] : []))];
    const visuals = prepareVisualWrites(payload.visuals, sectionSlots("home", payload.section).map(slot => slot.id), await mediaRepo.findByIds(ids));
    const settings = await settingsRepo.updateHomepageSection(payload.section, content, {}, visuals);
    return NextResponse.json({ content: settings.homepageContent?.[payload.section], visuals });
  } catch (error) {
    return errorResponse(error);
  }
}
