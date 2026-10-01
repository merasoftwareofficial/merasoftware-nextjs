/**
 * Clicks on a post's related posts and page buttons (src/lib/click-rules.ts). Mirrors
 * ClickRepo in src/lib/repo/types.ts; changing one means changing both.
 *
 * The one-per-24-hours claim reuses ViewSeen (models/View.ts), as shares do: a
 * click key is a different keyed hash from view and share keys.
 */

import { Schema, model, models } from "mongoose";

/** Clicks per post per placement per day (YYYY-MM-DD, India time). */
const ClickDaySchema = new Schema({
  blogId: { type: String, required: true },
  day: { type: String, required: true, index: true },
  placement: { type: String, required: true, enum: ["related", "next-page"] },
  count: { type: Number, default: 0 },
}, { versionKey: false });
ClickDaySchema.index({ blogId: 1, day: 1, placement: 1 }, { unique: true });

export const ClickDay = models.ClickDay || model("ClickDay", ClickDaySchema);
