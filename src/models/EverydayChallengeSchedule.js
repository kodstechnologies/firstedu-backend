import mongoose from "mongoose";

const everydayChallengeScheduleSchema = new mongoose.Schema(
  {
    day: {
      type: Number,
      required: true,
      min: 1,
      max: 7,
      unique: true, // Only one test assigned per day index
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("EverydayChallengeSchedule", everydayChallengeScheduleSchema);
