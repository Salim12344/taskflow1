import mongoose, { Schema, models, model } from "mongoose";

const DMMessageSchema = new Schema({
  threadId: { type: Schema.Types.ObjectId, ref: "DMThread", required: true },
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

DMMessageSchema.index({ threadId: 1, createdAt: 1 });

export type DMMessageDoc = mongoose.InferSchemaType<typeof DMMessageSchema> & { _id: mongoose.Types.ObjectId };

export default models.DMMessage || model("DMMessage", DMMessageSchema);
