import mongoose from "mongoose";

const QNA_REQUEST_SUBJECTS = ["general", "test_and_exams", "teacher_connect", "payment"];

const qnaRequestSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, "Question is required"],
      trim: true,
    },
    subject: {
      type: String,
      enum: {
        values: QNA_REQUEST_SUBJECTS,
        message: `Subject must be one of: ${QNA_REQUEST_SUBJECTS.join(", ")}`,
      },
      required: [true, "Subject is required"],
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "answered", "rejected"],
        message: "Status must be pending, answered, or rejected",
      },
      default: "pending",
    },
  },
  { timestamps: true }
);

qnaRequestSchema.index({ status: 1, createdAt: -1 });
qnaRequestSchema.index({ subject: 1 });
qnaRequestSchema.index({ requestedBy: 1 });

export default mongoose.models.QnARequest ||
  mongoose.model("QnARequest", qnaRequestSchema);
