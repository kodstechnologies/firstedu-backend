import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    classType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassType",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true }
);

subjectSchema.index({ classType: 1, name: 1 });

export default mongoose.models.Subject ||
  mongoose.model("Subject", subjectSchema);
