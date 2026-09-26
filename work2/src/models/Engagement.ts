import { Schema, model, models } from "mongoose";
const ReactionSchema = new Schema({ userId: { type: String, required: true }, targetId: { type: Schema.Types.ObjectId, required: true, ref: "Blog" }, reaction: { type: String, enum: ["helpful", "insightful"], required: true } }, { timestamps: true });
ReactionSchema.index({ userId: 1, targetId: 1, reaction: 1 }, { unique: true });
const SavedPostSchema = new Schema({ userId: { type: String, required: true }, blogId: { type: Schema.Types.ObjectId, required: true, ref: "Blog" } }, { timestamps: true });
SavedPostSchema.index({ userId: 1, blogId: 1 }, { unique: true });
export const Reaction = models.Reaction || model("Reaction", ReactionSchema);
export const SavedPost = models.SavedPost || model("SavedPost", SavedPostSchema);
