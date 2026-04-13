import mongoose from "mongoose";

const skillTestSchema = new mongoose.Schema(
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

skillTestSchema.index({ categoryId: 1, createdAt: 1 });
skillTestSchema.index({ categoryId: 1, testId: 1 }, { unique: true });
skillTestSchema.index({ categoryId: 1, title: 1 }, { unique: true });

skillTestSchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

skillTestSchema.set("toJSON", { virtuals: true });
skillTestSchema.set("toObject", { virtuals: true });

export default mongoose.models.SkillTest ||
  mongoose.model("SkillTest", skillTestSchema);
