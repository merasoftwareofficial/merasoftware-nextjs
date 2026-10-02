/**
 * PATCH /api/organization-seo   save the business details search engines read (editor and up)
 *
 * Body: { logoUrl, sameAs }. Used for the Organization data on the homepage
 * and /blog, and as every article's publisher (structured-data.ts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { settingsRepo } from "@/lib/repo";

const patchSchema = z.object({
  logoUrl: z.string().trim().url().or(z.literal("")).default(""),
  // A set of full https addresses: a profile listed twice is stored once.
  sameAs: z
    .array(z.string().trim().url().refine(url => url.startsWith("https://"), "Use full https:// addresses."))
    .max(10)
    .transform(list => [...new Set(list)])
    .default([]),
});

export async function PATCH(request: Request) {
  try {
    await requireRole("editor");
    const organization = patchSchema.parse(await request.json());
    const settings = await settingsRepo.update({ organization });
    return NextResponse.json(settings.organization ?? null);
  } catch (error) {
    return errorResponse(error);
  }
}
