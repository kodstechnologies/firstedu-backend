import mongoose from "mongoose";

const liveCompetitionCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // --------------------------------------------------
    // SUBMISSION RULES — source of truth for events
    // --------------------------------------------------

    /**
     * Whether events in this category require a TEXT essay
     * or FILE upload(s) from the participant.
     */
    submissionType: {
      type: String,
      enum: ["TEXT", "FILE"],
      required: true,
    },

    /**
     * Allowed file extensions for FILE-type categories.
     * e.g. ["pdf", "docx", "mp4", "mp3"]
     * Empty array means any file type is permitted.
     */
    allowedFileTypes: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const LiveCompetitionCategory = mongoose.model(
  "LiveCompetitionCategory",
  liveCompetitionCategorySchema
);

export default LiveCompetitionCategory;
