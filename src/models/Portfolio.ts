import { Schema, model, models } from "mongoose";
const image = new Schema({ assetId: String, url: String, alt: String, focalX: Number, focalY: Number }, { _id: false });
const source = new Schema({
  id: String, revision: Number, available: Boolean, type: String,
  customerId: String, customerName: String, name: String, category: String,
  state: String, linkedProjectId: String, url: String, captureAllowed: Boolean,
}, { _id: false });
const capture = new Schema({
  status: String, url: String, token: String, attempts: Number, nextAttemptAt: Number,
  leaseUntil: Number, error: String, completedAt: String, candidates: [image],
}, { _id: false });
const schema = new Schema({
  _id: String, source, title: String, slug: { type: String, unique: true }, brand: String,
  category: String, summary: String, problem: String, solution: String, result: String,
  services: [String], liveUrl: String, cover: { type: image, default: null }, gallery: [image],
  status: String, featured: Boolean, sortOrder: Number, capture,
  createdAt: String, updatedAt: String, syncedAt: String,
}, { versionKey: false });
schema.index({ status: 1, "source.available": 1, sortOrder: 1 });
schema.index({ "capture.status": 1, "capture.nextAttemptAt": 1 });
export const PortfolioModel = models.Portfolio || model("Portfolio", schema);
const reaction = new Schema({ entryId: String, userId: String, reaction: String });
reaction.index({ entryId: 1, userId: 1, reaction: 1 }, { unique: true });
export const PortfolioReactionModel = models.PortfolioReaction || model("PortfolioReaction", reaction);
