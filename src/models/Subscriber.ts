/**
 * Notification choices (src/docs/NOTIFICATIONS.md). Mirrors Subscriber in
 * src/lib/repo/types.ts; changing one means changing both.
 */

import { Schema, model, models } from "mongoose";

const SubscriberSchema = new Schema({
  email: { type: String, lowercase: true, trim: true },
  emailStatus: { type: String, enum: ["none", "pending", "active", "unsubscribed", "bounced"], required: true, default: "none" },
  emailConfirmedAt: Date,
  confirmSentAt: Date,
  userId: String,
  pendingUserId: String,
  token: { type: String, required: true, unique: true },
  categories: { type: [String], default: [], index: true },
  offers: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

// Partial unique indexes: a push-only or bell-only record has no email, a
// visitor's record has no userId, and many records may lack each.
SubscriberSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
SubscriberSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "string" } } });

export const SubscriberModel = models.Subscriber || model("Subscriber", SubscriberSchema);
