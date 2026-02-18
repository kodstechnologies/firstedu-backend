import mongoose from "mongoose";

const blogRequestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: {
        values: ["student", "teacher"],
        message: "Role must be either student or teacher",
      },
      required: [true, "Role is required"],
    },
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
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be pending, approved, or rejected",
      },
      default: "pending",
    },
    adminComment: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
blogRequestSchema.index({ status: 1, createdAt: -1 });
blogRequestSchema.index({ email: 1 });
blogRequestSchema.index({ role: 1 });

export default mongoose.models.BlogRequest ||
  mongoose.model("BlogRequest", blogRequestSchema);
