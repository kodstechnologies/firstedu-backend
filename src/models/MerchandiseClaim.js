import mongoose from "mongoose";

const merchandiseClaimSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    merchandise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchandise",
      required: true,
    },
    pointsSpent: {
      type: Number,
      required: true,
      min: 0,
    },
    moneyPaid: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["points", "wallet", "gateway"],
      default: "points",
    },
    paymentId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    deliveryAddress: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      addressLine1: { type: String, required: true, trim: true },
      addressLine2: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true, default: "India" },
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    shippedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    trackingNumber: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying claims
merchandiseClaimSchema.index({ student: 1, claimedAt: -1 });
merchandiseClaimSchema.index({ status: 1 });

export default mongoose.models.MerchandiseClaim ||
  mongoose.model("MerchandiseClaim", merchandiseClaimSchema);

