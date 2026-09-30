import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { homepageContentSchema } from "@/lib/homepage-content";
import { unknownSitePaths } from "@/lib/link-options";
import { settingsRepo } from "@/lib/repo";

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const content = homepageContentSchema.parse(await request.json());
    // Format is the schema's job; this catches a site path that no page answers.
    const unknown = await unknownSitePaths([content.hero.primaryHref, content.hero.secondaryHref, content.contact.buttonHref]);
    if (unknown.length) {
      return NextResponse.json({ error: `No page on the site at ${unknown.join(", ")}. Choose it from the list.` }, { status: 400 });
    }
    const settings = await settingsRepo.update({ homepageContent: content });
    return NextResponse.json(settings.homepageContent);
  } catch (error) {
    return errorResponse(error);
  }
}
