import { Schema, model, models } from "mongoose";

const MediaAssetSchema = new Schema({
  url: { type: String, required: true },
  sha256: { type: String, match: /^[a-f0-9]{64}$/ },
  publicId: { type: String, required: true, unique: true },
  assetId: { type: String, required: true },
  assetFolder: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  format: { type: String, required: true },
  bytes: { type: Number, required: true },
  altText: { type: String, default: "", trim: true, maxlength: 300 },
  kind: { type: String, enum: ["image", "video"], default: "image" },
}, { timestamps: true });

MediaAssetSchema.index({ createdAt: -1 });
// Partial unique index keeps older media records without a checksum readable.
MediaAssetSchema.index({ sha256: 1 }, { unique: true, partialFilterExpression: { sha256: { $type: "string" } } });

export const MediaAssetModel = models.MediaAsset || model("MediaAsset", MediaAssetSchema);
