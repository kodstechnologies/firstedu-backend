import mongoose from "mongoose";

const challengeYourselfProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stage: {
      type: String,
      required: true,
      enum: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Heroic"],
    },
    level: {
      type: Number,
      required: true,
      min: 1,
    },
    fullMarksAchieved: {
      type: Boolean,
      default: false,
    },
    bestScore: {
      type: Number,
      default: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
    },
    lastExamSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSession",
    },
    lastCompletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

challengeYourselfProgressSchema.index({ student: 1, stage: 1, level: 1 }, { unique: true });
challengeYourselfProgressSchema.index({ student: 1 });

export default mongoose.models.ChallengeYourselfProgress ||
  mongoose.model("ChallengeYourselfProgress", challengeYourselfProgressSchema);
