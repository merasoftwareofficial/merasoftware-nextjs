import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { mediaRepo, settingsRepo } from "@/lib/repo";
import { sectionSchema, sectionVisualIds } from "@/lib/page-content";
import { visualSchema } from "@/lib/visual-validation";
import { prepareVisualWrites } from "@/lib/visual-save";

const payloadSchema = z.object({ page: z.enum(["about", "services"]), section: z.string().max(50), content: z.unknown(), visuals: z.record(z.string(), visualSchema).default({}) }).strict();
export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid save origin." }, { status: 403 });
    const payload = payloadSchema.parse(await request.json());
    const schema = sectionSchema(payload.page, payload.section);
    if (!schema) return NextResponse.json({ error: "Unknown page section." }, { status: 400 });
    const content = schema.parse(payload.content);
    const allowed = new Set<string>(sectionVisualIds(payload.page, payload.section, content));
    if (Object.keys(payload.visuals).some(slot => !allowed.has(slot))) return NextResponse.json({ error: "Visual is not part of this section." }, { status: 400 });
    const ids = [...new Set(Object.values(payload.visuals).map(config => config.assetId).filter((id): id is string => !!id))];
    const visuals = prepareVisualWrites(payload.visuals, allowed, await mediaRepo.findByIds(ids));
    await settingsRepo.updatePageSection(payload.page, payload.section, content, visuals);
    return NextResponse.json({ content, visuals });
  } catch (error) { return errorResponse(error); }
}
