import mongoose from "mongoose";

/**
 * Prevents duplicate cron-sent tournament notifications (stage start / qualification results).
 */
const tournamentNotificationLogSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    kind: {
      type: String,
      enum: ["stage_start", "stage_results"],
      required: true,
    },
  },
  { timestamps: true }
);

tournamentNotificationLogSchema.index(
  { tournament: 1, stageId: 1, kind: 1 },
  { unique: true }
);

export default mongoose.models.TournamentNotificationLog ||
  mongoose.model("TournamentNotificationLog", tournamentNotificationLogSchema);
