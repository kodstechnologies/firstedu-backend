import mongoose from "mongoose";

const everydayChallengeCompletionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    examSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSession",
      required: true,
    },
    pointsEarned: {
      type: Number,
      required: true,
      min: 0,
    },
    streakDay: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
    },
  },
  { timestamps: true }
);

everydayChallengeCompletionSchema.index({ student: 1, date: 1 }, { unique: true });
everydayChallengeCompletionSchema.index({ student: 1, date: -1 });

export default mongoose.models.EverydayChallengeCompletion ||
  mongoose.model("EverydayChallengeCompletion", everydayChallengeCompletionSchema);
