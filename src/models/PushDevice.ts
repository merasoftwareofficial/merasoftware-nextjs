/**
 * Browsers that allowed notifications (src/docs/NOTIFICATIONS.md). Mirrors
 * PushDevice in src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const PushDeviceSchema = new Schema({
  subscriberId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  p256dh: { type: String, required: true },
  auth: { type: String, required: true },
  userAgent: String,
}, { timestamps: true, versionKey: false });

export const PushDeviceModel = models.PushDevice || model("PushDevice", PushDeviceSchema);
