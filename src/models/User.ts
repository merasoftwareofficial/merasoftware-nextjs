import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    role: { type: String, enum: ["visitor", "member", "moderator", "editor", "admin"], required: true },
    bio: { type: String, trim: true },
    banned: { type: Boolean, default: false },
    portalUserId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

export const User = models.User || model("User", UserSchema);
