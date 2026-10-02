/**
 * PATCH /api/page-seo   save one site page's search details (editor and up)
 *
 * Body: { key, title, description, imageUrl, imageAlt }. An empty field means
 * "use the page's built-in value" (lib/page-seo.ts); a page with every field
 * empty is removed from settings.pageSeo. Limits match the blog's (blog-rules.ts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { PAGE_SEO_PAGES } from "@/lib/page-seo";
import { settingsRepo, type PageSeo } from "@/lib/repo";

const patchSchema = z.object({
  key: z.string().refine(key => PAGE_SEO_PAGES.some(page => page.key === key), "Unknown page."),
  title: z.string().trim().max(70).default(""),
  description: z.string().trim().max(180).default(""),
  imageUrl: z.string().trim().url().or(z.literal("")).default(""),
  imageAlt: z.string().trim().max(160).default(""),
});

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const { key, ...input } = patchSchema.parse(await request.json());
    // Alt text belongs to an image; without one it is dropped.
    const value: PageSeo = { ...input, imageAlt: input.imageUrl ? input.imageAlt : "" };
    const next: Partial<Record<string, PageSeo>> = { ...((await settingsRepo.get()).pageSeo ?? {}) };
    if (Object.values(value).some(Boolean)) next[key] = value;
    else delete next[key];
    const settings = await settingsRepo.update({ pageSeo: next });
    return NextResponse.json(settings.pageSeo?.[key] ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}
