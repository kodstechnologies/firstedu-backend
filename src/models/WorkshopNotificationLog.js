import mongoose from "mongoose";

/**
 * Prevents duplicate cron-sent workshop notifications.
 */
const workshopNotificationLogSchema = new mongoose.Schema(
  {
    workshop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workshop",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["workshop_start_reminder", "workshop_start"],
      required: true,
    },
  },
  { timestamps: true }
);

workshopNotificationLogSchema.index(
  { workshop: 1, kind: 1 },
  { unique: true }
);

export default mongoose.models.WorkshopNotificationLog ||
  mongoose.model("WorkshopNotificationLog", workshopNotificationLogSchema);
