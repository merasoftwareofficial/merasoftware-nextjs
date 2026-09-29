/**
 * GET   /api/settings   read the site settings
 * PATCH /api/settings   change them (admin only)
 *
 * One row, so there is no id in the path. The comment defaults here decide
 * what every post that did not choose for itself does — see effectiveMode()
 * in comment-rules.ts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { settingsRepo } from "@/lib/repo";

const patchSchema = z.object({
  commentDefault: z.enum(["visible", "pending"]).optional(),
  commentsEnabled: z.boolean().optional(),
  viewsPublic: z.boolean().optional(),
});

export async function GET() {
  try {
    return NextResponse.json(await settingsRepo.get());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole("admin");
    const patch = patchSchema.parse(await request.json());
    return NextResponse.json(await settingsRepo.update(patch));
  } catch (error) {
    return errorResponse(error);
  }
}
