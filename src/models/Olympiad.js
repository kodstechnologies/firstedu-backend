import mongoose from "mongoose";

const olympiadSchema = new mongoose.Schema(
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
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    subject: {
      type: String,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    rules: {
      type: String,
      trim: true,
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    registrationStartTime: {
      type: Date,
      required: true,
    },
    registrationEndTime: {
      type: Date,
      required: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstPlacePoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    secondPlacePoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    thirdPlacePoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxParticipants: {
      type: Number,
      default: null, // null means unlimited
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

olympiadSchema.index({ startTime: 1, endTime: 1 });
olympiadSchema.index({ isPublished: 1 });

export default mongoose.models.Olympiad || mongoose.model("Olympiad", olympiadSchema);

