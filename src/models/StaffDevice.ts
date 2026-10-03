/**
 * Admin browsers that get activity alerts (src/docs/NOTIFICATIONS.md, "Admin
 * alerts"). Mirrors StaffDevice in src/lib/repo/types.ts; changing one means
 * changing both.
 */

import { Schema, model, models } from "mongoose";

const StaffDeviceSchema = new Schema({
  userId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  p256dh: { type: String, required: true },
  auth: { type: String, required: true },
  userAgent: String,
  lastSeenAt: { type: Date, required: true, index: true },
}, { timestamps: true, versionKey: false });

export const StaffDeviceModel = models.StaffDevice || model("StaffDevice", StaffDeviceSchema);
