/**
 * Blog view counting (src/lib/view-rules.ts). Mirrors ViewRepo in
 * src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

/**
 * One row per visitor key (a keyed hash, never a raw IP). MongoDB's TTL index
 * deletes it 24 hours after `at`, which is what limits a visitor to one view
 * per post per 24 hours.
 */
const ViewSeenSchema = new Schema({
  _id: { type: String, required: true },
  at: { type: Date, required: true, default: Date.now, expires: 24 * 60 * 60 },
}, { _id: false, versionKey: false });

/** Views per post per day (YYYY-MM-DD, India time), kept for trends. */
const ViewDaySchema = new Schema({
  blogId: { type: String, required: true },
  day: { type: String, required: true, index: true },
  count: { type: Number, default: 0 },
}, { versionKey: false });
ViewDaySchema.index({ blogId: 1, day: 1 }, { unique: true });

export const ViewSeen = models.ViewSeen || model("ViewSeen", ViewSeenSchema);
export const ViewDay = models.ViewDay || model("ViewDay", ViewDaySchema);
