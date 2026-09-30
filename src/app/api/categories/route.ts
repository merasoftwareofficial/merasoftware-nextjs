/**
 * POST /api/categories   add a category (admin only)
 *
 * The list itself reaches pages through categoryRepo on the server, so there
 * is no GET here.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { createCategory } from "@/lib/category-actions";

const createSchema = z.object({
  name: z.string(),
  membersCanUse: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    await requireRole("admin");
    const input = createSchema.parse(await request.json());
    return NextResponse.json(await createCategory(input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
