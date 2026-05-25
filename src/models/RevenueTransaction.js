import mongoose from "mongoose";

const revenueTransactionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    sourceType: {
      type: String,
      enum: ["course", "test", "test_bundle", "competition_category", "school", "competitive", "skill_development", "tournament", "workshop", "olympiads", "live_competition", "category_upgrade", "wallet", "other"],
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true, // Polymorphic ID (points to Course, Test, Bundle, Event, etc.)
    },
    itemName: {
      type: String,
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    categoryName: {
      type: String,
    },
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory", // Assuming there is a SubCategory model, otherwise it's just a Category
    },
    subCategoryName: {
      type: String,
    },
    paymentId: {
      type: String,
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast querying on revenue history page
revenueTransactionSchema.index({ purchasedAt: -1 });
revenueTransactionSchema.index({ paymentStatus: 1, purchasedAt: -1 });
revenueTransactionSchema.index({ sourceType: 1, paymentStatus: 1 });
revenueTransactionSchema.index({ student: 1 });
revenueTransactionSchema.index({ categoryId: 1, paymentStatus: 1, purchasedAt: -1 });

export default mongoose.models.RevenueTransaction ||
  mongoose.model("RevenueTransaction", revenueTransactionSchema);
