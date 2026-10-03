/**
 * Comment likes and the per-IP limit on them (src/lib/comment-rules.ts).
 * Mirrors CommentLike and RateRepo in src/lib/repo/types.ts; changing one
 * means changing both.
 */

import { Schema, model, models } from "mongoose";

const CommentLikeSchema = new Schema({
  commentId: { type: String, required: true },
  blogId: { type: String, required: true, index: true },
  voterKey: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
// One like per voter per comment; the unique index is what enforces it.
CommentLikeSchema.index({ commentId: 1, voterKey: 1 }, { unique: true });
CommentLikeSchema.index({ voterKey: 1 });

/**
 * One row per key per window: `_id` is "<key>:<window number>". MongoDB's TTL
 * index removes it a day after `at`, long after its window is over.
 */
const RateHitSchema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, default: 0 },
  at: { type: Date, required: true, default: Date.now, expires: 24 * 60 * 60 },
}, { _id: false, versionKey: false });

export const CommentLikeModel = models.CommentLike || model("CommentLike", CommentLikeSchema);
export const RateHitModel = models.RateHit || model("RateHit", RateHitSchema);
