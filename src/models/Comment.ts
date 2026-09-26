/**
 * Mongoose shapes for the engagement data the MongoDB driver will store.
 *
 * NOT used by working code — the repo layer in src/lib/repo/ is the interface
 * every route talks to, and the JSON driver serves it today. These schemas
 * exist so mongo-driver.ts has the collection shape ready, and they mirror the
 * fields in src/lib/repo/types.ts exactly; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const CommentSchema = new Schema({
  blogId: { type: Schema.Types.ObjectId, required: true, ref: "Blog", index: true },
  // A reply points at the comment it answers. Top-level comments leave it unset.
  parentId: { type: Schema.Types.ObjectId, ref: "Comment", index: true },
  userId: { type: String, required: true, index: true }, userName: { type: String, required: true },
  body: { type: String, required: true, trim: true },
  status: { type: String, enum: ["visible", "hidden", "pending"], default: "visible", index: true },
}, { timestamps: true });

const ReportSchema = new Schema({
  targetType: { type: String, enum: ["blog", "comment"], required: true },
  targetId: { type: String, required: true, index: true },
  userId: { type: String, required: true }, reason: { type: String, required: true, trim: true },
  resolved: { type: Boolean, default: false, index: true },
}, { timestamps: true });

/** One row, _id "site" — the settings an admin edits in the panel. */
const SettingsSchema = new Schema({
  _id: { type: String, default: "site" },
  commentDefault: { type: String, enum: ["visible", "pending"], default: "visible" },
  commentsEnabled: { type: Boolean, default: true },
}, { timestamps: true, _id: false });

export const Comment = models.Comment || model("Comment", CommentSchema);
export const Report = models.Report || model("Report", ReportSchema);
export const Settings = models.Settings || model("Settings", SettingsSchema);
