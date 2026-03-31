import mongoose from "mongoose";

// ─── CompetitionTest ─────────────────────────────────────────────────────────
//
//  A test entry inside a CompetitionCategory.
//
//  UI flow (admin):
//    1. Admin opens a category (e.g. "State level")
//    2. Clicks "Add New Test"
//    3. Types a display name  →  title  (e.g. "JEE Main 2024")
//    4. Picks from dropdown   →  testId (ref to existing Test document)
//    5. Clicks "Create Test"
//
//  Hierarchy: CompetitionSector → CompetitionCategory → CompetitionTest → Test
//
// ─────────────────────────────────────────────────────────────────────────────

const competitionTestSchema = new mongoose.Schema(
  {
    // Which category this test belongs to
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompetitionCategory",
      required: true,
      index: true,
    },

    // Display name shown to students (e.g. "JEE Main 2024", "Round 1")
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional wrapper description shown to students in competitive section
    description: {
      type: String,
      trim: true,
      default: "",
    },

    // Reference to the actual Test document (selected from dropdown)
    // Test.js holds questionBank, durationMinutes, proctoring rules, etc.
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },

    // Purchase guard — incremented when parent category is purchased.
    // Service layer: if purchaseCount > 0  →  block delete of this test.
    purchaseCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Fast fetch of all tests in a category
competitionTestSchema.index({ categoryId: 1, createdAt: 1 });

// Same Test (testId) cannot be added twice to the same category
competitionTestSchema.index({ categoryId: 1, testId: 1 }, { unique: true });

// Same title cannot be used twice in the same category
competitionTestSchema.index({ categoryId: 1, title: 1 }, { unique: true });

// Virtual: true if any student has purchased — used to block delete in service
competitionTestSchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

competitionTestSchema.set("toJSON", { virtuals: true });
competitionTestSchema.set("toObject", { virtuals: true });

export default mongoose.models.CompetitionTest ||
  mongoose.model("CompetitionTest", competitionTestSchema);
