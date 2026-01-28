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
    isFriendGroup: {
      type: Boolean,
      default: false,
    },
    invitedFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
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
challengeSchema.index({ startTime: 1, endTime: 1 });

export default mongoose.models.Challenge || mongoose.model("Challenge", challengeSchema);

