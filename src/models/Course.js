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
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    contentUrl: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["pdf", "video", "audio"],
      default: "pdf",
    },
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
  },
  {
    timestamps: true,
  }
);

courseSchema.index({ title: 1, createdBy: 1 });

export default mongoose.models.Course ||
  mongoose.model("Course", courseSchema);


