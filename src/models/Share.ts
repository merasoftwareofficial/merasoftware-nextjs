/**
 * Blog share-click counting (src/lib/share-rules.ts). Mirrors ShareRepo in
 * src/lib/repo/types.ts; changing one means changing both.
 *
 * The one-per-24-hours claim reuses ViewSeen (models/View.ts): a share key is
 * a different keyed hash from a view key, so the two never collide, and one
 * TTL collection does the forgetting for both.
 */

import { Schema, model, models } from "mongoose";

/** Share clicks per post per platform per day (YYYY-MM-DD, India time), kept for trends and ranking. */
const ShareDaySchema = new Schema({
  blogId: { type: String, required: true },
  day: { type: String, required: true, index: true },
  platform: { type: String, required: true, enum: ["whatsapp", "facebook", "x", "linkedin", "telegram", "email", "copy", "native"] },
  count: { type: Number, default: 0 },
}, { versionKey: false });
ShareDaySchema.index({ blogId: 1, day: 1, platform: 1 }, { unique: true });

export const ShareDay = models.ShareDay || model("ShareDay", ShareDaySchema);
