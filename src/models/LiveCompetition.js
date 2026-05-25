import mongoose from "mongoose";

// ─── Reusable Sub-Schemas ──────────────────────────────────────────────────

const submissionConfigSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["TEXT", "FILE"],
      required: true,
    },
    // TEXT (Essay / Poetry)
    text: {
      limit: Number,
      limitType: {
        type: String,
        enum: ["WORDS", "CHARACTERS"],
        default: "WORDS",
      },
      topic: String,
      rules: [String],
      walletPoints: { type: Number, default: 0 },
    },
    duration: Number, // minutes — for LIVE mode
    autoGeneratePdf: { type: Boolean, default: false },
    // FILE (Video / Audio / PDF)
    file: {
      allowedTypes:  [String], // ["mp4", "mp3", "pdf"] — populated from category
      maxSize:       Number,   // MB
      maxFiles:      { type: Number, default: 1 },
      instructions:  [String],
      walletPoints:  { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const feeSchema = new mongoose.Schema(
  {
    amount:   { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    isPaid:   { type: Boolean, default: false },
  },
  { _id: false }
);

const prizeSchema = new mongoose.Schema(
  {
    rank:         { type: Number, required: true }, // 1, 2, or 3
    walletPoints: { type: Number, default: 0 },
    description:  { type: String, trim: true },
  },
  { _id: false }
);

// ─── Main Schema ───────────────────────────────────────────────────────────

const liveCompetitionSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // BASIC INFO
    // -----------------------------------------------------------------------
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

    isPublished: {
      type: Boolean,
      default: false,
    },

    // -----------------------------------------------------------------------
    // ROUND 1 — MEGA AUDITION
    // Open to all registered students.
    // -----------------------------------------------------------------------
    megaAudition: {
      // Registration window — students sign up here
      registration: {
        start: { type: Date, required: true },
        end:   { type: Date, required: true },
      },

      // Event window — when students actually submit
      eventWindow: {
        start: { type: Date, required: true },
        end:   { type: Date, required: true },
      },

      /**
       * Admin cannot call declareResult(MEGA_AUDITION) before this date.
       * Ensures admin has enough time to review all submissions first.
       */
      resultDeclarationDate: { type: Date },

      /**
       * Maximum students admin can qualify for Grand Finale.
       * 0 = unlimited.
       */
      maxQualifiers: { type: Number, default: 0 },

      submission: submissionConfigSchema,
      fee:        feeSchema,

      status: {
        type: String,
        enum: ["DRAFT", "UPCOMING", "LIVE", "CLOSED", "RESULT_DECLARED"],
        default: "DRAFT",
      },

      totalParticipants: { type: Number, default: 0 },
      totalSubmissions:  { type: Number, default: 0 },
    },

    // -----------------------------------------------------------------------
    // ROUND 2 — GRAND FINALE
    // Only available to students qualified by admin from Round 1.
    // Stays LOCKED until Round 1 RESULT_DECLARED.
    // -----------------------------------------------------------------------
    grandFinale: {
      /**
       * Payment window — qualified students must pay their Round 2 entry fee
       * within this window. Must open AFTER megaAudition.resultDeclarationDate.
       */
      paymentWindow: {
        start: { type: Date },
        end:   { type: Date },
      },

      // Event window — when Grand Finale submissions happen
      eventWindow: {
        start: { type: Date },
        end:   { type: Date },
      },

      /**
       * Admin cannot call declareResult(GRAND_FINALE) before this date.
       */
      resultDeclarationDate: { type: Date },

      submission: submissionConfigSchema,
      fee:        feeSchema,

      /**
       * Prize configuration per rank.
       * Wallet points are credited automatically when admin declares winners.
       */
      prizes: [prizeSchema],

      status: {
        type: String,
        enum: ["LOCKED", "UPCOMING", "LIVE", "CLOSED", "RESULT_DECLARED"],
        default: "LOCKED",
      },

      totalParticipants: { type: Number, default: 0 },
      totalSubmissions:  { type: Number, default: 0 },
    },

    // -----------------------------------------------------------------------
    // ADMIN
    // -----------------------------------------------------------------------
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
