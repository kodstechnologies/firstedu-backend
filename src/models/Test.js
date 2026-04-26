import mongoose from "mongoose";

const testSchema = new mongoose.Schema(
  {
    title: {
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
      default: null,
    },
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuestionBank",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    proctoringInstructions: {
      type: String,
      trim: true,
      default:
        "Please do not switch tabs or minimize the browser window during the test. Any suspicious activity will be logged.",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    applicableFor: {
      type: String,
      enum: [
        "test",
        "testBundle",
        "tournament",
        "challenge_yourself",
        "everyday_challenge",
        "challenge_yourfriends",
        "competition_sector",
        "Olympiads",
        "School",
        "Competitive",
        "Skill Development",
        "certificate",
        "trending_test"
      ],
      default: "test",
      index: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    upgradeNotificationSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

testSchema.index({ title: 1, createdBy: 1 });
testSchema.index({ questionBank: 1 });

export default mongoose.models.Test || mongoose.model("Test", testSchema);
