import mongoose from "mongoose";

const merchandiseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    pointsRequired: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      trim: true,
      default: "general",
    },
    isPhysical: {
      type: Boolean,
      default: false, // true if requires delivery address
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    stockQuantity: {
      type: Number,
      default: null, // null means unlimited (no inventory tracking)
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Merchandise ||
  mongoose.model("Merchandise", merchandiseSchema);

