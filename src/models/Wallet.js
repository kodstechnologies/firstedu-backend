import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType",
      required: true,
    },
    userType: {
      type: String,
      enum: ["User", "Teacher"],
      required: true,
    },
    monetaryBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    rewardPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one wallet per user
walletSchema.index({ user: 1, userType: 1 }, { unique: true });

export default mongoose.models.Wallet ||
  mongoose.model("Wallet", walletSchema);

