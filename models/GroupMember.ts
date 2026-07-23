import mongoose, { Schema, models, model } from "mongoose";

const GroupMemberSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["admin", "member"], required: true },
  joinedAt: { type: Date, default: Date.now },
});

GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
GroupMemberSchema.index({ userId: 1 });

export type GroupMemberDoc = mongoose.InferSchemaType<typeof GroupMemberSchema> & { _id: mongoose.Types.ObjectId };

export default models.GroupMember || model("GroupMember", GroupMemberSchema);
