import mongoose from "mongoose";

const tournamentStageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      enum: ["Qualifier", "Semi-Final", "Final"],
    },
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
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
    // Among registered participants who complete this stage's test: min score as % of max marks (score/maxScore×100).
    // Advancing to the next stage is allowed only after this stage's endTime, if this threshold is met.
    minimumPercentageToQualify: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    maxParticipants: {
      type: Number,
      default: null,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: true }
);

const tournamentSchema = new mongoose.Schema(
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
    stages: [tournamentStageSchema],
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

tournamentSchema.index({ "stages.startTime": 1, "stages.endTime": 1 });
tournamentSchema.index({ isPublished: 1 });

export default mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);

