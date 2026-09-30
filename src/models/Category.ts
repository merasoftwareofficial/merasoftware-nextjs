/**
 * Blog categories (src/lib/category-rules.ts). Mirrors Category in
 * src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const CategorySchema = new Schema({
  name: { type: String, required: true, trim: true },
  // topicSlug(name). Unique, so two spellings of one name ("SEO", "seo") cannot both exist.
  slug: { type: String, required: true, unique: true },
  membersCanUse: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  formerSlugs: { type: [String], default: [], index: true },
}, { timestamps: true, versionKey: false });

export const CategoryModel = models.Category || model("Category", CategorySchema);
