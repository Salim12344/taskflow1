import mongoose, { Schema, models, model } from "mongoose";

const TaskSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: ["todo", "in_progress", "pending_review", "done"],
    default: "todo",
  },
  rejectionHistory: [
    {
      reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      reason: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  deadline: { type: Date, default: null },
  submittedAt: { type: Date, default: null }, // set when status -> pending_review, used to sort the review queue oldest-first
  recurrence: { type: String, enum: ["none", "daily", "weekly", "monthly"], default: "none" },
  subtasks: [
    {
      text: { type: String, required: true },
      done: { type: Boolean, default: false },
    },
  ],
  attachments: [
    {
      url: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: true },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null },
});

export type TaskDoc = mongoose.InferSchemaType<typeof TaskSchema> & { _id: mongoose.Types.ObjectId };

export default models.Task || model("Task", TaskSchema);
