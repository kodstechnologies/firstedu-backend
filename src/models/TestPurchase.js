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
    schoolCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    skillCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
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

// Ensure exactly one provider is provided
testPurchaseSchema.pre("validate", function (next) {
  const providers = [this.test, this.testBundle, this.competitionCategory, this.schoolCategory, this.skillCategory].filter(Boolean);
  if (providers.length === 0) {
    return next(new Error("Either test, testBundle, competitionCategory, schoolCategory, or skillCategory must be provided"));
  }
  if (providers.length > 1) {
    return next(new Error("Only one of test, testBundle, competitionCategory, schoolCategory, or skillCategory can be provided"));
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

testPurchaseSchema.index(
  { student: 1, schoolCategory: 1 },
  { unique: true, partialFilterExpression: { schoolCategory: { $exists: true, $ne: null } } }
);

testPurchaseSchema.index(
  { student: 1, skillCategory: 1 },
  { unique: true, partialFilterExpression: { skillCategory: { $exists: true, $ne: null } } }
);

export default mongoose.models.TestPurchase ||
  mongoose.model("TestPurchase", testPurchaseSchema);

