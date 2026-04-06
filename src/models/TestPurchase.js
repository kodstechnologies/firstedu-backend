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
    competitionCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompetitionCategory",
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
  const providers = [this.test, this.testBundle, this.competitionCategory].filter(Boolean);
  if (providers.length === 0) {
    return next(new Error("Either test, testBundle, or competitionCategory must be provided"));
  }
  if (providers.length > 1) {
    return next(new Error("Only one of test, testBundle, or competitionCategory can be provided"));
  }
  next();
});

// Prevent duplicate purchases for individual tests (only when test is set)
testPurchaseSchema.index(
  { student: 1, test: 1 },
  { unique: true, partialFilterExpression: { test: { $exists: true } } }
);
// Prevent duplicate purchases for bundles (only when testBundle is set)
testPurchaseSchema.index(
  { student: 1, testBundle: 1 },
  { unique: true, partialFilterExpression: { testBundle: { $exists: true } } }
);

// Prevent duplicate purchases for competition categories
testPurchaseSchema.index(
  { student: 1, competitionCategory: 1 },
  { unique: true, partialFilterExpression: { competitionCategory: { $exists: true } } }
);

export default mongoose.models.TestPurchase ||
  mongoose.model("TestPurchase", testPurchaseSchema);

