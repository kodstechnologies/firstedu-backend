import mongoose from "mongoose";

const liveCompetitionSchema = new mongoose.Schema(
  {
    // -------------------------------
    // BASIC INFO
    // -------------------------------
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveCompetitionCategory",
      index: true,
    },

    bannerUrl: String,

    // -------------------------------
    // TIMING
    // -------------------------------
    registration: {
      start: { type: Date, required: true },
      end:   { type: Date, required: true },
    },

    eventWindow: {
      start: { type: Date, required: true },
      end:   { type: Date, required: true },
    },

    // -------------------------------
    // SUBMISSION CONFIG
    // Driven by the linked category's submissionType.
    // MULTIPLE removed — use TEXT or FILE only.
    // -------------------------------
    submission: {
      type: {
        type: String,
        enum: ["TEXT", "FILE"], // MULTIPLE removed
        required: true,
      },

      mode: {
        type: String,
        enum: ["LIVE", "UPLOAD"],
        default: "UPLOAD",
      },

      // TEXT (Essay / Poetry)
      text: {
        limit: Number,
        limitType: {
          type: String,
          enum: ["WORDS", "CHARACTERS"],
          default: "WORDS",
        },
      },

      duration: Number, // minutes (for LIVE mode)

      autoGeneratePdf: {
        type: Boolean,
        default: false,
      },

      // FILE (Video / Audio / PDF)
      file: {
        allowedTypes: [String], // ["mp4", "mp3", "pdf"] — populated from category
        maxSize: Number,        // MB
        maxFiles: {
          type: Number,
          default: 1,
        },
      },
    },

    // -------------------------------
    // FEE
    // -------------------------------
    fee: {
      amount: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: "INR",
      },
      isPaid: {
        type: Boolean,
        default: false,
      },
    },

    // -------------------------------
    // STATUS & PUBLISHING
    // -------------------------------
    isPublished: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["DRAFT", "UPCOMING", "LIVE", "CLOSED", "RESULT_DECLARED"],
      default: "DRAFT",
    },

    // winners removed — truth lives in LiveCompetitionSubmission.rank / isWinner

    // -------------------------------
    // STATS
    // -------------------------------
    totalParticipants: {
      type: Number,
      default: 0,
    },

    totalSubmissions: {
      type: Number,
      default: 0,
    },

    // -------------------------------
    // ADMIN
    // -------------------------------
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export const LiveCompetition = mongoose.model(
  "LiveCompetition",
  liveCompetitionSchema
);

export default LiveCompetition;
