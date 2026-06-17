import mongoose from "mongoose";

/**
 * Prevents duplicate cron-sent live competition notifications.
 * kind enum:
 *   "start_reminder_11"  — Round 1 11-min pre-start push + email
 *   "start"              — Round 1 event start push + email
 *   "gf_start_reminder_11" — Grand Finale 11-min pre-start push + email
 *   "gf_start"           — Grand Finale event start push + email
 *   "round1_result"      — Round 1 (Mega Audition) result push + email
 *   "round2_result"      — Round 2 (Grand Finale)  result push + email
 */
const liveCompetitionNotificationLogSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveCompetition",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: [
        "start_reminder_11",
        "start",
        "gf_start_reminder_11",
        "gf_start",
        "round1_result",
        "round2_result",
      ],
      required: true,
    },
  },
  { timestamps: true }
);

// Unique constraint prevents double-sending if cron overlaps
liveCompetitionNotificationLogSchema.index(
  { event: 1, kind: 1 },
  { unique: true }
);

export default mongoose.models.LiveCompetitionNotificationLog ||
  mongoose.model(
    "LiveCompetitionNotificationLog",
    liveCompetitionNotificationLogSchema
  );
