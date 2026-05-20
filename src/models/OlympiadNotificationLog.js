import mongoose from "mongoose";

/**
 * Prevents duplicate cron-sent olympiad notifications.
 */
const olympiadNotificationLogSchema = new mongoose.Schema(
  {
    olympiad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OlympiadTest",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["exam_start_reminder", "exam_start", "results_declared"],
      required: true,
    },
  },
  { timestamps: true }
);

olympiadNotificationLogSchema.index(
  { olympiad: 1, kind: 1 },
  { unique: true }
);

export default mongoose.models.OlympiadNotificationLog ||
  mongoose.model("OlympiadNotificationLog", olympiadNotificationLogSchema);
