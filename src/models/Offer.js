import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    // 🔹 Offer display / identification name
    offerName: {
      type: String,
      required: true,
      trim: true,
    },

    // 🔹 Where the offer applies
    applicableOn: {
      type: String,
      enum: [
        "all",
        "Test",
        "TestSeries",
        "Course",
        "Olympiads",
        "Tournament",
        "Workshop",
        "Ecommerce",
        "CompetitionCategory",
        "LiveCompetition",
        "School",
        "Competitive",
        "Skill Development",
      ],
      default: "all",
    },

    // 🔹 Scoping variables (Optional: to bind this offer to a specific document rather than a global pillar)
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      refPath: "entityModel",
    },
    entityModel: {
      type: String,
      enum: ["Category", null],
      default: null,
    },

    // 🔹 Discount definition
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    // 🔹 Control
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
    },

    // 🔹 Validity
    validTill: {
      type: Date,
      default: null,
    },

    // 🔹 Optional metadata
    description: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// 🔐 Only ONE active offer per module type AND entity combinations
offerSchema.index(
  { applicableOn: 1, status: 1, entityId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);

export default mongoose.model("Offer", offerSchema);
