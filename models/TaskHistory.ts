import mongoose, { Schema, models, model } from "mongoose";

const TaskHistorySchema = new Schema({
  taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  field: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

TaskHistorySchema.index({ taskId: 1 });

export type TaskHistoryDoc = mongoose.InferSchemaType<typeof TaskHistorySchema> & { _id: mongoose.Types.ObjectId };

export default models.TaskHistory || model("TaskHistory", TaskHistorySchema);
