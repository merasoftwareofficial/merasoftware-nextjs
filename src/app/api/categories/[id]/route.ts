/**
 * PATCH  /api/categories/[id]   rename, open to members, archive or restore (admin only)
 * DELETE /api/categories/[id]   delete a category no post uses (admin only)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { deleteCategory, updateCategory } from "@/lib/category-actions";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().optional(),
  membersCanUse: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const result = await updateCategory(id, patchSchema.parse(await request.json()));
    if (!result) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireRole("admin");
    const { id } = await params;
    const deleted = await deleteCategory(id);
    if (deleted === null) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
