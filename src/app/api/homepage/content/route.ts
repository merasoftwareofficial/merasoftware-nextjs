import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { homepageContentSchema } from "@/lib/homepage-content";
import { settingsRepo } from "@/lib/repo";

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const content = homepageContentSchema.parse(await request.json());
    const settings = await settingsRepo.update({ homepageContent: content });
    return NextResponse.json(settings.homepageContent);
  } catch (error) {
    return errorResponse(error);
  }
}
