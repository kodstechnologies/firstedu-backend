import mongoose from "mongoose";

const successStorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    achievement: {
      type: String,
      required: [true, "Achievement is required"],
      trim: true,
    },
    achieveIn: {
      type: String,
      required: [true, "Achieve in is required"],
      trim: true,
    },
    mediaUrl: {
      type: String,
      trim: true,
    },
    thumbnailUrl: {
      type: String,
      required: [true, "Thumbnail (image) URL is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["DRAFT", "PUBLISHED"],
        message: "Status must be either DRAFT or PUBLISHED",
      },
      default: "DRAFT",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true }
);

successStorySchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.SuccessStory ||
  mongoose.model("SuccessStory", successStorySchema);
