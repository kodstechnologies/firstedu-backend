import mongoose from "mongoose";

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false },
});

const connectedSubQuestionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true },
    questionType: {
      type: String,
      enum: ["single", "multiple", "true_false"],
      required: true,
    },
    options: { type: [optionSchema], default: [] },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    explanation: { type: String, trim: true, required: true },
    marks: { type: Number, default: 1 },
    negativeMarks: { type: Number, default: 0 },
    imageUrl: [{ type: String, trim: true }],
  },
  { _id: false }
);

const aiQuestionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true, default: null },
    questionType: {
      type: String,
      enum: ["single", "multiple", "true_false", "connected"],
      default: "single",
    },
    options: [optionSchema],
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: function () {
        return this.questionType !== "connected" && !this.isParent;
      },
    },
    explanation: {
      type: String,
      trim: true,
      required: function () {
        return this.questionType !== "connected" && !this.isParent;
      },
    },
    subject: { type: String, trim: true },
    aiQuestionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiQuestionBank",
      required: true,
    },
    orderInBank: { type: Number, min: 0 },
    sectionIndex: { type: Number, min: 0, default: null },
    topic: { type: String, trim: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
    marks: { type: Number, default: 1 },
    negativeMarks: { type: Number, default: 0 },
    tags: [{ type: String, trim: true }],
    aiBatchNumber: { type: Number, min: 1, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    isActive: { type: Boolean, default: true },
    isParent: { type: Boolean, default: false },
    parentQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiQuestion",
      default: null,
    },
    passage: {
      type: String,
      trim: true,
      required: function () {
        return this.isParent === true;
      },
    },
    connectedQuestions: { type: [connectedSubQuestionSchema], default: [] },
    childQuestions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AiQuestion",
      },
    ],
  },
  { timestamps: true }
);

aiQuestionSchema.index({ aiQuestionBank: 1, orderInBank: 1 });

export default mongoose.models.AiQuestion ||
  mongoose.model("AiQuestion", aiQuestionSchema);
