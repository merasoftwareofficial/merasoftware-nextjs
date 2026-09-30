import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { mediaRepo, settingsRepo, type HomeImageSlot, type HomepageImage } from "@/lib/repo";

const imageSchema = z.object({
  assetId: z.string().min(1),
  alt: z.string().trim().max(300),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
});

const patchSchema = z.object({
  hero: imageSchema.nullable().optional(),
  "work-northstar": imageSchema.nullable().optional(),
  "work-oasis": imageSchema.nullable().optional(),
}).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const patch = patchSchema.parse(await request.json());
    const current = (await settingsRepo.get()).homepageImages ?? {};
    const next: Partial<Record<HomeImageSlot, HomepageImage>> = { ...current };
    for (const slot of ["hero", "work-northstar", "work-oasis"] as const) {
      if (!(slot in patch)) continue;
      const image = patch[slot];
      if (image === null) delete next[slot];
      else if (image) next[slot] = image;
    }

    const ids = Object.values(next).filter((image): image is HomepageImage => Boolean(image)).map(image => image.assetId);
    const assets = await mediaRepo.findByIds(ids);
    if (assets.length !== new Set(ids).size) {
      return NextResponse.json({ error: "Choose an image from the media library." }, { status: 400 });
    }

    const settings = await settingsRepo.update({ homepageImages: next });
    return NextResponse.json(settings.homepageImages ?? {});
  } catch (error) {
    return errorResponse(error);
  }
}
