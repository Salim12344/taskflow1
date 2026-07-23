import mongoose, { Schema, models, model } from "mongoose";

const GroupMessageSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  attachments: [
    {
      url: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: true },
    },
  ],
  mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
  readBy: [
    {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      readAt: { type: Date, required: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  isSystemMessage: { type: Boolean, default: false },
});

GroupMessageSchema.index({ groupId: 1, createdAt: 1 });

export type GroupMessageDoc = mongoose.InferSchemaType<typeof GroupMessageSchema> & { _id: mongoose.Types.ObjectId };

export default models.GroupMessage || model("GroupMessage", GroupMessageSchema);
