/**
 * PATCH /api/reports/[id]   mark a report resolved or reopen it (moderator+)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { reportRepo } from "@/lib/repo";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ resolved: z.boolean() });

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await requireRole("moderator");

    const { resolved } = patchSchema.parse(await request.json());
    const updated = await reportRepo.update(id, { resolved });
    if (!updated) return NextResponse.json({ error: "Report not found." }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
