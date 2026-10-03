/**
 * The notification queue (src/lib/notify-queue.ts). Mirrors NotifyJob in
 * src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const NotifyJobSchema = new Schema({
  kind: { type: String, enum: ["post", "campaign", "comment", "reaction", "report"], required: true },
  refId: { type: String, required: true },
  channel: { type: String, enum: ["push", "email"], required: true },
  status: { type: String, enum: ["queued", "running", "done", "skipped"], required: true, default: "queued", index: true },
  lockedUntil: Date,
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  note: String,
}, { timestamps: true, versionKey: false });
// One job per announcement per channel, so a second publish event cannot queue it twice.
NotifyJobSchema.index({ kind: 1, refId: 1, channel: 1 }, { unique: true });

/**
 * One row per message sent: `_id` is "<job id>:<device or subscriber id>".
 * Claiming the row before sending is what stops two runners sending twice.
 * MongoDB's TTL index removes it after 90 days, long after any job is finished.
 */
const DeliverySchema = new Schema({
  _id: { type: String, required: true },
  at: { type: Date, required: true, default: Date.now, expires: 90 * 24 * 60 * 60 },
}, { _id: false, versionKey: false });

export const NotifyJobModel = models.NotifyJob || model("NotifyJob", NotifyJobSchema);
export const DeliveryModel = models.Delivery || model("Delivery", DeliverySchema);
