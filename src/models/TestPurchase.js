import mongoose from "mongoose";

const testPurchaseSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
    },
    testBundle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestBundle",
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
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
  },
  {
    timestamps: true,
  }
);

// Ensure either test or testBundle is provided, not both
testPurchaseSchema.pre("validate", function (next) {
  if (!this.test && !this.testBundle) {
    return next(new Error("Either test or testBundle must be provided"));
  }
  if (this.test && this.testBundle) {
    return next(new Error("Cannot provide both test and testBundle"));
  }
  next();
});

// Prevent duplicate purchases for individual tests
testPurchaseSchema.index({ student: 1, test: 1 }, { unique: true, sparse: true });
// Prevent duplicate purchases for bundles
testPurchaseSchema.index({ student: 1, testBundle: 1 }, { unique: true, sparse: true });

export default mongoose.models.TestPurchase ||
  mongoose.model("TestPurchase", testPurchaseSchema);

