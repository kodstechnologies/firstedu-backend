import mongoose from "mongoose";

/**
 * Pending withdrawal only. Document is deleted after admin approves or rejects.
 */
const teacherWithdrawalRequestSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

// One pending withdrawal per teacher at a time
teacherWithdrawalRequestSchema.index({ teacher: 1 }, { unique: true });

export default mongoose.models.TeacherWithdrawalRequest ||
  mongoose.model("TeacherWithdrawalRequest", teacherWithdrawalRequestSchema);
