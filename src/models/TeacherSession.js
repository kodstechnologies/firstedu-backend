import mongoose from "mongoose";

const teacherSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "ongoing", "completed", "cancelled"],
      default: "pending",
    },
    subject: {
      type: String,
      trim: true,
      required: true,
    },
    sessionKind: {
      type: String,
      enum: ["call", "chat"],
      default: "call",
    },
    chatStartedAt: {
      type: Date,
      default: null,
    },
    sessionEndReason: {
      type: String,
      trim: true,
      default: null,
    },
    perMinuteRate: {
      type: Number,
      required: true,
      min: 0,
    },
    // Agora RTC voice/video call
    callStartTime: {
      type: Date,
      default: null,
    },
    callEndTime: {
      type: Date,
      default: null,
    },
    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Billing
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDeducted: {
      type: Boolean,
      default: false,
    },
    // Recording
    recordingUrl: {
      type: String,
      trim: true,
      default: null,
    },
    // Optional: Agora Cloud Recording resource id (or similar)
    agoraRecordingId: {
      type: String,
      trim: true,
      default: null,
    },
    /** Who created the session row: student request vs teacher-initiated (future). */
    initiatedBy: {
      type: String,
      enum: ["student", "teacher"],
      default: "student",
    },
    // Request metadata
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
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
teacherSessionSchema.index({ student: 1, createdAt: -1 });
teacherSessionSchema.index({ teacher: 1, createdAt: -1 });
teacherSessionSchema.index({ status: 1 });

export default mongoose.models.TeacherSession ||
  mongoose.model("TeacherSession", teacherSessionSchema);

