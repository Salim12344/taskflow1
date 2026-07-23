import mongoose, { Schema, models, model } from "mongoose";

const ActivityLogSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  meta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

ActivityLogSchema.index({ groupId: 1, createdAt: -1 });

export type ActivityLogDoc = mongoose.InferSchemaType<typeof ActivityLogSchema> & { _id: mongoose.Types.ObjectId };

export default models.ActivityLog || model("ActivityLog", ActivityLogSchema);
