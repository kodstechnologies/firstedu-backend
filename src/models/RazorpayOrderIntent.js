import mongoose from "mongoose";

/** Tracks Razorpay order -> (student, type, entity) for webhook reconciliation on payment.captured */
const razorpayOrderIntentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "course",
        "test",
        "bundle",
        "olympiad",
        "tournament",
        "workshop",
        "wallet",
        "live_competition",
      ],
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "entityModel",
      index: true,
    },
    entityModel: {
      type: String,
      required: true,
      enum: [
        "Course",
        "Test",
        "TestBundle",
        "Olympiad",
        "Tournament",
        "Workshop",
        "User",
        "CompetitionCategory",
        "LiveCompetition",
      ],
    },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    receipt: { type: String, trim: true },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    reconciled: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date },
    paymentId: { type: String, trim: true },
  },
  { timestamps: true },
);

razorpayOrderIntentSchema.index({ reconciled: 1, createdAt: 1 });

export default mongoose.models.RazorpayOrderIntent ||
  mongoose.model("RazorpayOrderIntent", razorpayOrderIntentSchema);
