import mongoose, { Schema, models, model } from "mongoose";

const ProjectSchema = new Schema({
  groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  status: { type: String, enum: ["active", "completed", "archived"], default: "active" },
  deadline: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

export type ProjectDoc = mongoose.InferSchemaType<typeof ProjectSchema> & { _id: mongoose.Types.ObjectId };

export default models.Project || model("Project", ProjectSchema);
