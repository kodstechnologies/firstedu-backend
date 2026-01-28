import mongoose from "mongoose";

const supportMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "senderType",
    },
    senderType: {
      type: String,
      enum: ["User", "Admin"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: [
      {
        url: {
          type: String,
          required: true,
        },
        fileName: {
          type: String,
          required: true,
        },
        fileType: {
          type: String,
        },
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
supportMessageSchema.index({ ticket: 1, createdAt: 1 });
supportMessageSchema.index({ sender: 1, senderType: 1 });

export default mongoose.models.SupportMessage ||
  mongoose.model("SupportMessage", supportMessageSchema);

