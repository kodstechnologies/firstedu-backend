import mongoose from "mongoose";

/**
 * Caches the "Need to Improve" suggestions for a student.
 * Rebuilt on demand (GET) if lastComputedAt is > 6 hours old,
 * or force-refreshed via POST /need-to-improve/refresh.
 *
 * Weak category = any category where the student's average score
 * across completed exam sessions for that category is < 50%.
 */
const practiceTestSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test" },
    title: { type: String },
    price: { type: Number, default: 0 },
    isPurchased: { type: Boolean, default: false },
  },
  { _id: false }
);

const courseItemSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
    title: { type: String },
    contentType: { type: String, enum: ["pdf", "video", "audio"] },
  },
  { _id: false }
);

const teacherItemSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
    name: { type: String },
    profileImage: { type: String, default: null },
    skills: [{ type: String }],
    isLive: { type: Boolean, default: false },
  },
  { _id: false }
);

const weakCategorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    categoryName: { type: String, required: true },
    percentageScore: { type: Number, default: 0 }, // avg % score across weak sessions
    suggestions: {
      practiceTests: [practiceTestSchema],
      videos: [courseItemSchema],
      studyMaterials: [courseItemSchema],
      teachers: [teacherItemSchema],
    },
  },
  { _id: false }
);

const needToImproveSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    lastComputedAt: {
      type: Date,
      default: null,
    },
    weakCategories: [weakCategorySchema],
  },
  { timestamps: true }
);

export default mongoose.models.NeedToImprove ||
  mongoose.model("NeedToImprove", needToImproveSchema);
