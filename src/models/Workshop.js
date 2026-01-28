import mongoose from "mongoose";

const workshopSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    meetingLink: {
      type: String,
      required: true,
      trim: true, // Zoom/Meet link - securely stored
    },
    meetingPassword: {
      type: String,
      trim: true, // Optional meeting password
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxParticipants: {
      type: Number,
      default: null,
    },
    registrationStartTime: {
      type: Date,
      required: true,
    },
    registrationEndTime: {
      type: Date,
      required: true,
    },
    eventType: {
      type: String,
      enum: ["workshop", "essay", "poem", "dance", "singing", "other"],
      default: "workshop",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

workshopSchema.index({ startTime: 1, endTime: 1 });
workshopSchema.index({ teacher: 1 });
workshopSchema.index({ isPublished: 1 });

export default mongoose.models.Workshop || mongoose.model("Workshop", workshopSchema);

