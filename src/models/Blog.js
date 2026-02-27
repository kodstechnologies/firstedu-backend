import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Blog title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Blog description is required"],
      trim: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },
    keyTakeaways: {
      type: [String],
      default: [],
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
    source: {
      type: String,
      enum: {
        values: ["user_request", "admin"],
        message: "Source must be user_request or admin",
      },
      required: true,
    },
    blogRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogRequest",
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    authorName: {
      type: String,
      trim: true,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

blogSchema.index({ source: 1, createdAt: -1 });
blogSchema.index({ subject: 1 });

export default mongoose.models.Blog || mongoose.model("Blog", blogSchema);
