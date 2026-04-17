import mongoose from "mongoose";

const olympiadTestSchema = new mongoose.Schema(
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

    // ── Schedule & Timeline ────────────────────────────────────
    registrationStartTime: { type: Date, default: null },
    registrationEndTime:   { type: Date, default: null },
    startTime:             { type: Date, default: null },
    endTime:               { type: Date, default: null }, // auto-computed by service
    resultDeclarationDate: { type: Date, default: null },

    // ── Prize Points ───────────────────────────────────────────
    firstPlacePoints:  { type: Number, default: 0, min: 0 },
    secondPlacePoints: { type: Number, default: 0, min: 0 },
    thirdPlacePoints:  { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
  }
);

olympiadTestSchema.index({ categoryId: 1, createdAt: 1 });
olympiadTestSchema.index({ categoryId: 1, testId: 1 }, { unique: true });
olympiadTestSchema.index({ categoryId: 1, title: 1 }, { unique: true });

olympiadTestSchema.virtual("hasPurchase").get(function () {
  return this.purchaseCount > 0;
});

olympiadTestSchema.set("toJSON", { virtuals: true });
olympiadTestSchema.set("toObject", { virtuals: true });

export default mongoose.models.OlympiadTest ||
  mongoose.model("OlympiadTest", olympiadTestSchema);
