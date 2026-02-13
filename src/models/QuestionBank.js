import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    count: { type: Number, required: true, min: 1 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
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
