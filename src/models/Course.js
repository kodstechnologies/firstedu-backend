import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
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
    syllabus: [
      {
        type: String,
        trim: true,
      },
    ],
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    contents: [
      {
        url: { type: String, required: true, trim: true },
        type: { type: String, enum: ["pdf", "video", "audio"], required: true },
        originalName: { type: String, trim: true },
      },
    ],
    price: {
      type: Number,
      default: 0,
      min: 0,
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
    categoryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    isCertification: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

courseSchema.index({ title: 1, createdBy: 1 });

export default mongoose.models.Course ||
  mongoose.model("Course", courseSchema);


