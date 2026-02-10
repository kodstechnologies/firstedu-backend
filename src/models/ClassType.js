import mongoose from "mongoose";

const classTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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

classTypeSchema.index({ name: 1 });
classTypeSchema.index({ createdBy: 1 });

export default mongoose.models.ClassType ||
  mongoose.model("ClassType", classTypeSchema);
