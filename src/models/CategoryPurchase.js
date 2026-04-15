import mongoose from "mongoose";

const categoryPurchaseSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    pillarType: {
      type: String,
      enum: ["school", "competitive", "olympiad", "skill"],
      required: true,
      index: true,
    },
    unlockedCategoryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["free", "wallet", "razorpay"],
      required: true,
    },
    paymentId: {
      type: String,
      trim: true,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate purchase of exact same node by same student
categoryPurchaseSchema.index({ student: 1, categoryId: 1 }, { unique: true });
// Fast query for all purchases in a specific pillar for a student
categoryPurchaseSchema.index({ student: 1, pillarType: 1 });
// Admin analytics
categoryPurchaseSchema.index({ pillarType: 1, paymentStatus: 1 });
// Fast query for cascade access check
categoryPurchaseSchema.index({ student: 1, unlockedCategoryIds: 1 });

export default mongoose.models.CategoryPurchase ||
  mongoose.model("CategoryPurchase", categoryPurchaseSchema);
