import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
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
      enum: ["technical", "billing", "course", "account", "other"],
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

// Generate unique ticket number before save
supportTicketSchema.pre("save", async function (next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model("SupportTicket").countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
  }
  next();
});

// Indexes for efficient queries
supportTicketSchema.index({ student: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ assignedTo: 1 });
// ticketNumber already has unique: true which creates an index automatically

export default mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", supportTicketSchema);

