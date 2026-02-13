import mongoose from "mongoose";

/**
 * Hierarchical category for organizing content.
 * Example: School (root) -> Classes -> Class 1, Class 2... Class 12
 *          School (root) -> Subjects -> Physics, Chemistry, Math
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
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

categorySchema.index({ parent: 1, order: 1 });
categorySchema.index({ name: 1 });
categorySchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.models.Category ||
  mongoose.model("Category", categorySchema);
