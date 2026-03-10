import mongoose from "mongoose";
import crypto from "crypto";

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "technical",
        "billing",
        "course",
        "account",
        "payment",
        "exam_issue",
        "proctoring_issue",
        "certificate_issue",
        "content_error",
        "feature_request",
        "teacher_connect",
        "live_event",
        "feedback",
        "general_inquiry",
        "other",
      ],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Internal notes (only visible to admin)
    internalNotes: [
      {
        note: {
          type: String,
          trim: true,
        },
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Admin",
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Timestamps
    openedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);



function generateTicketNumber() {
  const letters = crypto.randomBytes(2).toString("hex").toUpperCase(); // 4 letters
  const numbers = Math.floor(100000 + Math.random() * 900000); // 6 digit number
  return `TKT-${letters}-${numbers}`;
}

supportTicketSchema.pre("save", async function (next) {
  if (!this.ticketNumber) {
    this.ticketNumber = generateTicketNumber();
  }
  next();
});
// Generate unique ticket number before save


// Indexes for efficient queries
supportTicketSchema.index({ student: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ assignedTo: 1 });
// ticketNumber already has unique: true which creates an index automatically

export default mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", supportTicketSchema);

