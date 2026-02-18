import mongoose from "mongoose";

const supportSchema = new mongoose.Schema(
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
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "resolved"],
        message: "Status must be either pending or resolved",
      },
      default: "pending",
    },
    adminReply: {
      type: String,
      trim: true,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
supportSchema.index({ status: 1, createdAt: -1 });
supportSchema.index({ email: 1 });
supportSchema.index({ role: 1 });

export default mongoose.models.Support ||
  mongoose.model("ContactSupport", supportSchema);
