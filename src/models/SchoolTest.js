import mongoose from "mongoose";

const schoolTestSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },

    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    purchaseCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

schoolTestSchema.index({ categoryId: 1, createdAt: 1 });
schoolTestSchema.index({ categoryId: 1, testId: 1 }, { unique: true });
schoolTestSchema.index({ categoryId: 1, title: 1 }, { unique: true });

schoolTestSchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

schoolTestSchema.set("toJSON", { virtuals: true });
schoolTestSchema.set("toObject", { virtuals: true });

export default mongoose.models.SchoolTest ||
  mongoose.model("SchoolTest", schoolTestSchema);
