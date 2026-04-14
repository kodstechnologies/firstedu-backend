import mongoose from "mongoose";

const competitiveTestSchema = new mongoose.Schema(
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

competitiveTestSchema.index({ categoryId: 1, createdAt: 1 });
competitiveTestSchema.index({ categoryId: 1, testId: 1 }, { unique: true });
competitiveTestSchema.index({ categoryId: 1, title: 1 }, { unique: true });

competitiveTestSchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

competitiveTestSchema.set("toJSON", { virtuals: true });
competitiveTestSchema.set("toObject", { virtuals: true });

export default mongoose.models.CompetitiveTest ||
  mongoose.model("CompetitiveTest", competitiveTestSchema);
