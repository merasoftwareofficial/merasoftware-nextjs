import "server-only";

/**
 * The writes behind /admin/categories. Routes check the admin role and call
 * these; the checks themselves live in category-rules.ts.
 *
 * Every change that touches posts moves the posts first and changes the list
 * after. If a step fails midway, no post is left pointing at nothing: at worst
 * an emptied category stays in the list for the admin to delete.
 */

import { blogRepo, categoryRepo, type Category } from "@/lib/repo";
import { categoryNameSchema, categorySlug, nameClash } from "@/lib/category-rules";

/** A live category now answers at `slug`, so no other category may keep it as an old address. */
async function releaseSlug(categories: Category[], slug: string, exceptId?: string) {
  for (const category of categories) {
    if (category._id !== exceptId && category.formerSlugs.includes(slug)) {
      await categoryRepo.update(category._id, { formerSlugs: category.formerSlugs.filter(former => former !== slug) });
    }
  }
}

function clashMessage(existing: Category) {
  return `"${existing.name}" already exists. Use it, or move posts into it.`;
}

/**
 * Adds a category. Posts that carry exactly the typed name (an old free-text
 * value with odd spacing) are moved onto the cleaned-up name.
 */
export async function createCategory(input: { name: string; membersCanUse: boolean }) {
  const name = categoryNameSchema.parse(input.name);
  const categories = await categoryRepo.list();
  const clash = nameClash(categories, name);
  if (clash) throw new Error(clashMessage(clash));

  const slug = categorySlug(name);
  await releaseSlug(categories, slug);
  const category = await categoryRepo.create({ name, slug, membersCanUse: input.membersCanUse, archived: false, formerSlugs: [] });
  if (input.name !== name) await blogRepo.renameCategory(input.name, name);
  return category;
}

/**
 * Renames, opens or closes to members, archives or restores. A rename rewrites
 * the name on every post and keeps the old address, which then redirects.
 * Null when the category does not exist.
 */
export async function updateCategory(id: string, input: { name?: string; membersCanUse?: boolean; archived?: boolean }) {
  const categories = await categoryRepo.list();
  const current = categories.find(category => category._id === id);
  if (!current) return null;

  const patch: Partial<Omit<Category, "_id" | "createdAt" | "updatedAt">> = {};
  if (input.membersCanUse !== undefined) patch.membersCanUse = input.membersCanUse;
  if (input.archived !== undefined) patch.archived = input.archived;

  const name = input.name === undefined ? current.name : categoryNameSchema.parse(input.name);
  if (name !== current.name) {
    const clash = nameClash(categories, name, id);
    if (clash) throw new Error(clashMessage(clash));
    patch.name = name;
    const slug = categorySlug(name);
    if (slug !== current.slug) {
      patch.slug = slug;
      patch.formerSlugs = [...new Set([...current.formerSlugs, current.slug])].filter(former => former !== slug);
      await releaseSlug(categories, slug, id);
    }
  }

  const category = await categoryRepo.update(id, patch);
  if (!category) return null;
  const moved = name !== current.name ? await blogRepo.renameCategory(current.name, name) : 0;
  return { category, moved };
}

/**
 * Moves every post filed under `from` into the category `intoId`. `from` is a
 * listed category — removed afterwards, its address redirecting to the target —
 * or a name found only on posts (an old free-text value).
 */
export async function mergeCategory(from: string, intoId: string) {
  const categories = await categoryRepo.list();
  const target = categories.find(category => category._id === intoId);
  if (!target) throw new Error("Choose the category to move the posts into.");
  if (target.archived) throw new Error(`"${target.name}" is archived. Restore it first, or choose another category.`);
  if (from === target.name) throw new Error("Choose a different category to move the posts into.");

  const source = categories.find(category => category.name === from);
  const moved = await blogRepo.renameCategory(from, target.name);
  if (source) {
    const formerSlugs = [...new Set([...target.formerSlugs, ...source.formerSlugs, source.slug])].filter(former => former !== target.slug);
    await categoryRepo.update(target._id, { formerSlugs });
    await categoryRepo.remove(source._id);
  }
  return { moved, removed: !!source };
}

/** Deletes a category no post uses. Null when it does not exist. */
export async function deleteCategory(id: string) {
  const category = await categoryRepo.findById(id);
  if (!category) return null;
  const inUse = (await blogRepo.categoryCounts())[category.name] ?? 0;
  if (inUse) {
    throw new Error(`${inUse} ${inUse === 1 ? "post uses" : "posts use"} "${category.name}". Move ${inUse === 1 ? "it" : "them"} to another category first.`);
  }
  return categoryRepo.remove(id);
}
