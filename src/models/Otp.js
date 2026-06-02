import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // MongoDB automatically deletes document after 300 seconds (5 minutes)
    },
  },
  { timestamps: true }
);

export default mongoose.model("Otp", otpSchema);
