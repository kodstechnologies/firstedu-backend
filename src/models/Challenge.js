import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema(
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
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Can be created by student or admin
      required: true,
    },
    creatorType: {
      type: String,
      enum: ["student", "admin", "system"],
      required: true,
    },
    roomCode: {
      type: String,
      required: true,
      index: { unique: true, sparse: true },
      minlength: 6,
      maxlength: 6,
    },
    roomStatus: {
      type: String,
      enum: ["waiting", "started", "completed"],
      default: "waiting",
    },
    participants: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

challengeSchema.index({ createdBy: 1, isActive: 1 });

export default mongoose.models.Challenge || mongoose.model("Challenge", challengeSchema);

