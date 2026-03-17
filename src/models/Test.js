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
    proctoringInstructions: {
      type: String,
      trim: true,
      default: "Please do not switch tabs or minimize the browser window during the test. Any suspicious activity will be logged.",
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    applicableFor: {
      type: String,
      enum: ["test", "testBundle", "olympiad", "tournament", "challenge_yourself"],
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
    isEverydayChallenge: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

testSchema.index({ title: 1, createdBy: 1 });
testSchema.index({ questionBank: 1 });

export default mongoose.models.Test || mongoose.model("Test", testSchema);


