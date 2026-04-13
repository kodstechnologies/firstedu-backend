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
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    rules: {
      type: String,
      trim: true,
    },
    about: { type: String, trim: true, default: null },
    syllabus: { type: String, trim: true, default: null },
    markingScheme: { type: String, trim: true, default: null },
    rankingCriteria: { type: String, trim: true, default: null },
    examDatesAndDetails: { type: String, trim: true, default: null },
    awards: { type: String, trim: true, default: null },
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

