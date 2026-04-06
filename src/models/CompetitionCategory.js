import mongoose from "mongoose";

// ─── CompetitionCategory ────────────────────────────────────────────────────
//
//  Hierarchy:  CompetitionSector  →  CompetitionCategory  →  CompetitionTest
//
//  Purchase guard (service layer) — check: purchaseCount > 0
//   ✅ ALWAYS allowed : edit title / description / icon / status
//   ✅ ALWAYS allowed : add new tests
//   ❌ BLOCKED        : delete category   — if purchaseCount > 0
//   ❌ BLOCKED        : change price      — if purchaseCount > 0
//   ❌ BLOCKED        : delete a test     — if purchaseCount > 0
// ────────────────────────────────────────────────────────────────────────────

const competitionCategorySchema = new mongoose.Schema(
  {
    // ── Parent sector ──────────────────────────────────────────────────────
    sectorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompetitionSector",
      required: true,
      index: true,
    },

    // ── Basic info ─────────────────────────────────────────────────────────
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
    // icon: {
    //   type: String,
    //   trim: true,
    //   default: "graduation",
    // },

    // ── Publish status ─────────────────────────────────────────────────────
    //  "Draft"  → visible only to admin
    //  "Public" → visible to students in marketplace
    //  Admin can toggle this at ANY time, even after students have purchased.
    status: {
      type: String,
      enum: ["Draft", "Public"],
      default: "Draft",
    },

    // ── Pricing ────────────────────────────────────────────────────────────
    //  Effective price logic (computed in service):
    //    isFree         → 0 (free enrolment, no payment)
    //    !isFree        → discountedPrice ?? price
    isFree: {
      type: Boolean,
      default: false,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      default: null,
      min: 0,
    },

    // ── Tests ──────────────────────────────────────────────────────────────
    //  References to CompetitionTest documents.
    //  Admin can ADD tests at any time.
    //  Admin CANNOT DELETE a test once any student has purchased this category.
    tests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CompetitionTest",
      },
    ],

    // ── Purchase tracking ─────────────────────────────────────────────────
    //  Simple counter — incremented by +1 on every successful purchase.
    //  Guard check in service: purchaseCount > 0  →  block delete / price change / test delete
    //  Scales to any number of students, no arrays, no loops.
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

// ── Indexes ──────────────────────────────────────────────────────────────────
competitionCategorySchema.index({ sectorId: 1, status: 1 });
competitionCategorySchema.index({ sectorId: 1, createdAt: -1 });

// ── Virtual: effectivePrice ───────────────────────────────────────────────────
competitionCategorySchema.virtual("effectivePrice").get(function () {
  if (this.isFree) return 0;
  return this.discountedPrice ?? this.price;
});

// ── Virtual: hasPurchase ──────────────────────────────────────────────────────
//  Use this in the service layer to decide whether guards apply.
competitionCategorySchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

competitionCategorySchema.set("toJSON", { virtuals: true });
competitionCategorySchema.set("toObject", { virtuals: true });

export default mongoose.models.CompetitionCategory ||
  mongoose.model("CompetitionCategory", competitionCategorySchema);
