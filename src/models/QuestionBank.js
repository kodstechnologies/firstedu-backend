import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, trim: true },
    count: { type: Number, required: true, min: 1 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
  },
  { _id: false }
);

const questionBankSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    useSectionWiseDifficulty: {
      type: Boolean,
      default: false,
    },
    overallDifficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    sections: [sectionSchema],
    useSectionWiseQuestions: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true }
);

questionBankSchema.index({ categories: 1 });
questionBankSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.models.QuestionBank ||
  mongoose.model("QuestionBank", questionBankSchema);
