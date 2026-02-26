import mongoose from "mongoose";

const QNA_SUBJECTS = ["general", "test_and_exams", "teacher_connect", "payment"];

const qnaSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
    },
    answer: {
      type: String,
      required: [true, "Answer is required"],
      trim: true,
    },
    subject: {
      type: String,
      enum: {
        values: QNA_SUBJECTS,
        message: `Subject must be one of: ${QNA_SUBJECTS.join(", ")}`,
      },
      required: [true, "Subject is required"],
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

qnaSchema.index({ subject: 1 });
qnaSchema.index({ createdAt: -1 });

export default mongoose.models.QnA || mongoose.model("QnA", qnaSchema);
