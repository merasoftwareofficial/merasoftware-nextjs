/**
 * An offer or announcement written in the admin panel and sent as a push
 * (src/docs/NOTIFICATIONS.md, step B). Mirrors Campaign in
 * src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const CampaignSchema = new Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, default: "", trim: true },
  url: { type: String, required: true, default: "/" },
  target: {
    offers: { type: Boolean, default: true },
    categoryIds: { type: [String], default: [] },
  },
  status: { type: String, enum: ["draft", "sent"], required: true, default: "draft", index: true },
  createdBy: { type: String, required: true },
  sentAt: Date,
}, { timestamps: true, versionKey: false });

export const CampaignModel = models.Campaign || model("Campaign", CampaignSchema);
