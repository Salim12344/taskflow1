import mongoose, { Schema, models, model } from "mongoose";

const DMThreadSchema = new Schema({
  participantIds: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
  lastMessageAt: { type: Date, default: Date.now },
});

DMThreadSchema.index({ participantIds: 1 });

export type DMThreadDoc = mongoose.InferSchemaType<typeof DMThreadSchema> & { _id: mongoose.Types.ObjectId };

export default models.DMThread || model("DMThread", DMThreadSchema);
