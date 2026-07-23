import mongoose, { Schema, models, model } from "mongoose";

const OrganizationSchema = new Schema({
  name: { type: String, required: true },
  regNumber: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{6}$/,
  },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

export type OrganizationDoc = mongoose.InferSchemaType<typeof OrganizationSchema> & { _id: mongoose.Types.ObjectId };

export default models.Organization || model("Organization", OrganizationSchema);
