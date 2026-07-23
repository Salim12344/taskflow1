import mongoose, { Schema, models, model } from "mongoose";

const TaskChatMessageSchema = new Schema({
  taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
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
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date, default: null },
});

TaskChatMessageSchema.index({ taskId: 1, createdAt: 1 });

export type TaskChatMessageDoc = mongoose.InferSchemaType<typeof TaskChatMessageSchema> & { _id: mongoose.Types.ObjectId };

export default models.TaskChatMessage || model("TaskChatMessage", TaskChatMessageSchema);
