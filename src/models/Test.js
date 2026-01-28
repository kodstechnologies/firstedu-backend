import mongoose from "mongoose";

const randomConfigSchema = new mongoose.Schema(
  {
    count: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestCategory",
    },
    testType: {
      type: String,
      enum: ["School", "Competitive", "Olympiads", "Skill Development"],
      default: "Competitive",
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
      },
    ],
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
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    negativeMarksPerQuestion: {
      type: Number,
      default: 0,
      min: 0,
    },
    selectionMode: {
      type: String,
      enum: ["manual", "random"],
      default: "manual",
    },
    randomConfig: randomConfigSchema,
    isPublished: {
      type: Boolean,
      default: false,
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

// Validate max 60 questions
testSchema.pre("save", function (next) {
  if (this.questions && this.questions.length > 60) {
    return next(new Error("A test can have maximum 60 questions"));
  }
  next();
});

testSchema.index({ title: 1, createdBy: 1 });
testSchema.index({ testType: 1 });

export default mongoose.models.Test || mongoose.model("Test", testSchema);


