import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { homepageContentSchema } from "@/lib/homepage-content";
import { mediaRepo, settingsRepo, type HomeImageSlot, type HomepageImage } from "@/lib/repo";

const imageSchema = z.object({
  assetId: z.string().min(1),
  alt: z.string().trim().max(300),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
}).strict();

const requestSchema = z.object({
  section: z.enum(["hero", "marquee", "services", "pointOfView", "work", "insights", "contact"]),
  content: z.unknown(),
  images: z.object({
    hero: imageSchema.nullable().optional(),
    "work-northstar": imageSchema.nullable().optional(),
    "work-oasis": imageSchema.nullable().optional(),
  }).strict().default({}),
}).strict();

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const payload = requestSchema.parse(await request.json());
    const content = homepageContentSchema.shape[payload.section].parse(payload.content);
    const allowed: HomeImageSlot[] = payload.section === "hero"
      ? ["hero"]
      : payload.section === "work" ? ["work-northstar", "work-oasis"] : [];
    const images = payload.images as Partial<Record<HomeImageSlot, HomepageImage | null>>;
    if (Object.keys(images).some(slot => !allowed.includes(slot as HomeImageSlot))) {
      return NextResponse.json({ error: "Image is not part of this section." }, { status: 400 });
    }
    const ids = Object.values(images).filter((image): image is HomepageImage => Boolean(image)).map(image => image.assetId);
    if (ids.length) {
      const assets = await mediaRepo.findByIds(ids);
      if (assets.length !== new Set(ids).size) {
        return NextResponse.json({ error: "Choose an image from the media library." }, { status: 400 });
      }
    }
    const settings = await settingsRepo.updateHomepageSection(payload.section, content, images);
    return NextResponse.json({ content: settings.homepageContent?.[payload.section], images: settings.homepageImages ?? {} });
  } catch (error) {
    return errorResponse(error);
  }
}
