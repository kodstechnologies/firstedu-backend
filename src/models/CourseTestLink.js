import mongoose from "mongoose";

const courseTestLinkSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isRequired: {
      type: Boolean,
      default: true,
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

// Prevent duplicate links
courseTestLinkSchema.index({ course: 1, test: 1 }, { unique: true });

export default mongoose.models.CourseTestLink ||
  mongoose.model("CourseTestLink", courseTestLinkSchema);

