import mongoose, { Schema, models, model } from "mongoose";

const InviteLinkSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  type: { type: String, enum: ["email", "link"], required: true },
  email: { type: String, default: null },
  token: { type: String, required: true, unique: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  maxUses: { type: Number, default: null },
  useCount: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

export type InviteLinkDoc = mongoose.InferSchemaType<typeof InviteLinkSchema> & { _id: mongoose.Types.ObjectId };

export default models.InviteLink || model("InviteLink", InviteLinkSchema);
