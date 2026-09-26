import { Schema, model, models } from "mongoose";

const BlogSchema = new Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  excerpt: { type: String, required: true }, content: { type: Schema.Types.Mixed, required: true }, authorId: { type: String, required: true, index: true },
  authorName: { type: String, required: true }, type: { type: String, enum: ["official", "community", "discussion"], required: true },
  visibility: { type: String, enum: ["public", "members", "private", "unlisted"], default: "public" },
  status: { type: String, enum: ["draft", "pending", "published", "scheduled", "rejected", "archived"], default: "draft", index: true },
  category: String, tags: [String], featuredImage: { url: String, publicId: String, alt: String }, seo: { title: String, description: String, canonical: String },
  publishedAt: Date, scheduledFor: Date, noIndex: { type: Boolean, default: true },
  reviewNote: String, comments: { type: String, enum: ["default", "open", "moderated", "closed"], default: "default" }, helpfulCount: { type: Number, default: 0 }, insightfulCount: { type: Number, default: 0 }, saveCount: { type: Number, default: 0 },
}, { timestamps: true });
export const Blog = models.Blog || model("Blog", BlogSchema);
