import mongoose from "mongoose";

const pointsTransactionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["earned", "spent", "expired"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: [
        "course_completion",
        "test_completion",
        "merchandise_redemption",
        "admin_adjustment",
        "expiration",
          "referral" 
      ],
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      // Can reference Course, Test, MerchandiseClaim, etc.
    },
    referenceType: {
      type: String,
      enum: ["Course", "Test", "MerchandiseClaim", "Referral", null],
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying student transactions
pointsTransactionSchema.index({ student: 1, createdAt: -1 });

export default mongoose.models.PointsTransaction ||
  mongoose.model("PointsTransaction", pointsTransactionSchema);

