import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    type: {
      type: String,
      enum: [
        "general",
        "announcement",
        "course",
        "test",
        "event",
        "system",
        "upgrade",
        "teacher_withdrawal_approved",
        "teacher_withdrawal_rejected",
        "live_competition_result",
        "teacher_chat_request",
        "teacher_call_request",
        "teacher_chat_accepted",
        "teacher_call_accepted",
        "teacher_chat_rejected",
        "teacher_call_rejected",
        "teacher_chat_insufficient_balance",
      ],
      default: "general",
    },
    fcmSent: {
      type: Boolean,
      default: false,
    },
    fcmSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for better query performance
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ sentBy: 1 });

export default mongoose.model("Notification", notificationSchema);

