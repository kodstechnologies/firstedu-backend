import mongoose from "mongoose";

const teacherWalletTransactionSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["credit", "debit", "info"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "session_earning",
        "withdrawal_lock",
        "withdrawal_payout",
        "withdrawal_refund",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    referenceId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    referenceType: {
      type: String,
      default: null,
      trim: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

teacherWalletTransactionSchema.index({ teacher: 1, createdAt: -1 });

export default mongoose.models.TeacherWalletTransaction ||
  mongoose.model("TeacherWalletTransaction", teacherWalletTransactionSchema);
