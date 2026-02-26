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
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.every((item) => typeof item === "string");
        },
        message: "Key takeaways must be an array of strings",
      },
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be pending, approved, or rejected",
      },
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
blogRequestSchema.index({ status: 1, createdAt: -1 });
blogRequestSchema.index({ email: 1 });

export default mongoose.models.BlogRequest ||
  mongoose.model("BlogRequest", blogRequestSchema);
