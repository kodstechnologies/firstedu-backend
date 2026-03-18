import mongoose from "mongoose";

const eventRegistrationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventType: {
      type: String,
      enum: ["olympiad", "tournament", "workshop", "challenge"],
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "eventModel",
    },
    eventModel: {
      type: String,
      enum: ["Olympiad", "Tournament", "Workshop", "Challenge"],
      required: true,
    },
    tournamentStage: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // For tournament stage-specific registrations
    },
    status: {
      type: String,
      enum: ["registered", "attended", "completed", "disqualified"],
      default: "registered",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "refunded"],
      default: "pending",
    },
    paymentId: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ["free", "wallet", "razorpay"],
    },
    amountPaid: {
      type: Number,
      min: 0,
      default: 0,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

eventRegistrationSchema.index({ student: 1, eventType: 1, eventId: 1 }, { unique: true });
eventRegistrationSchema.index({ eventType: 1, eventId: 1 });
eventRegistrationSchema.index({ status: 1 });

export default mongoose.models.EventRegistration || mongoose.model("EventRegistration", eventRegistrationSchema);

