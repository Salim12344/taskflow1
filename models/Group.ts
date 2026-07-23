import mongoose, { Schema, models, model } from "mongoose";

const GroupSchema = new Schema({
  name: { type: String, required: true },
  orgId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
  onboardingDismissed: { type: Boolean, default: false },
});

export type GroupDoc = mongoose.InferSchemaType<typeof GroupSchema> & { _id: mongoose.Types.ObjectId };

export default models.Group || model("Group", GroupSchema);
