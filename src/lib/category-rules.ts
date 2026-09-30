/**
 * Blog categories: what a valid name is, which categories a post may be filed
 * under, and where an old category address now points. Same role as
 * blog-rules.ts — the API routes, the admin page and both post forms ask here,
 * so they cannot disagree.
 *
 * Only an admin manages the list (owner decision, 30 Sep 2026); editors and
 * members choose from it. A post stores the category's name (Blog.category).
 */

import { z } from "zod";
import { topicMatches, topicSlug } from "@/lib/topic-slug";
import type { BlogType, Category } from "@/lib/repo/types";

/** Trimmed, one space between words, 2–60 characters (the post field allows 60). */
export const categoryNameSchema = z
  .string()
  .transform(value => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "needs at least 2 characters")
      .max(60, "must be 60 characters or fewer")
      .regex(/[\p{L}\p{N}]/u, "needs a letter or number"),
  );

/** A category's /topics address: the same rule every category and tag link uses. */
export const categorySlug = (name: string) => topicSlug(name);

/** The category already answering at this name's address, other than `exceptId`. */
export function nameClash(categories: Category[], name: string, exceptId?: string) {
  const slug = categorySlug(name);
  return categories.find(category => category._id !== exceptId && category.slug === slug) ?? null;
}

/** May a post of this type be filed under this category from now on? */
export function usableFor(category: Category, type: BlogType) {
  return !category.archived && (type === "official" || category.membersCanUse);
}

/**
 * The names a post form offers, in list order. A post's current category comes
 * first when it is no longer offered (archived, or an old free-text value), so
 * opening and saving the post never drops it.
 */
export function categoryChoices(categories: Category[], type: BlogType, current?: string) {
  const names = categories.filter(category => usableFor(category, type)).map(category => category.name);
  return current && !names.includes(current) ? [current, ...names] : names;
}

/** Null when a post of this type may carry `next`; otherwise the reason. Keeping the current value is always allowed. */
export function categoryError(categories: Category[], type: BlogType, next: string | undefined, current?: string) {
  if (!next || next === current) return null;
  const category = categories.find(item => item.name === next);
  if (!category) return "Choose a category from the list.";
  if (category.archived) return `"${category.name}" is archived. Choose another category.`;
  if (!usableFor(category, type)) return `"${category.name}" is not open to community posts.`;
  return null;
}

/** The category an old address (from before a rename or merge) now belongs to, if any. `slug` is the route param. */
export function movedCategory(categories: Category[], slug: string) {
  if (categories.some(category => topicMatches(category.slug, slug))) return null;
  return categories.find(category => category.formerSlugs.some(former => topicMatches(former, slug))) ?? null;
}
