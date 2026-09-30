/**
 * POST /api/categories/merge   move every post of one category into another (admin only)
 *
 * `from` is a category name: a listed category, which is removed afterwards
 * and whose address then redirects to the target, or a name found only on
 * posts. `into` is the target category's id.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { mergeCategory } from "@/lib/category-actions";

const mergeSchema = z.object({
  from: z.string().min(1),
  into: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireRole("admin");
    const { from, into } = mergeSchema.parse(await request.json());
    return NextResponse.json(await mergeCategory(from, into));
  } catch (error) {
    return errorResponse(error);
  }
}
