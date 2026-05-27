import mongoose from "mongoose";

const liveCompetitionSubmissionSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // RELATIONS
    // -----------------------------------------------------------------------
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveCompetition",
      required: true,
      index: true,
    },

    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // -----------------------------------------------------------------------
    // ROUND
    // Identifies which round this submission belongs to.
    // Default "MEGA_AUDITION" ensures existing records remain valid.
    // -----------------------------------------------------------------------
    round: {
      type: String,
      enum: ["MEGA_AUDITION", "GRAND_FINALE"],
      required: true,
      default: "MEGA_AUDITION",
    },

    // -----------------------------------------------------------------------
    // CONTENT
    // -----------------------------------------------------------------------
    content: {
      // TEXT (Essay / Poetry)
      text: {
        type: String,
        trim: true,
      },

      // FILE (Video / Audio / PDF)
      files: [
        {
          url:      String,
          fileType: String, // "mp4", "mp3", "pdf"
          fileName: String,
          fileSize: Number, // bytes — for audit trail
        },
      ],

      // Generated PDF (for essay auto-export)
      pdfUrl: String,
    },

    // -----------------------------------------------------------------------
    // LIVE ESSAY SUPPORT
    // -----------------------------------------------------------------------
    startedAt: Date,

    /**
     * Locks the attempt after startEssaySession is called.
     * Prevents the student from starting a second session for the same round.
     */
    attemptLocked: {
      type: Boolean,
      default: false,
    },

    submittedAt: Date,

    // -----------------------------------------------------------------------
    // PAYMENT
    // -----------------------------------------------------------------------
    paymentStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },

    transactionId: String,

    // -----------------------------------------------------------------------
    // ADMIN EVALUATION
    // -----------------------------------------------------------------------

    /**
     * PENDING = not yet reviewed by admin.
     * CHECKED = admin has viewed and marked this submission.
     */
    evaluationStatus: {
      type: String,
      enum: ["PENDING", "CHECKED"],
      default: "PENDING",
    },

    /**
     * Admin marks this true to qualify the student for the Grand Finale.
     * Only meaningful on MEGA_AUDITION round submissions.
     */
    isQualified: {
      type: Boolean,
      default: false,
    },

    qualifiedAt: Date,

    qualifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    /**
     * Rank within this round — 1 (gold), 2 (silver), 3 (bronze).
     * For MEGA_AUDITION: informational only (optional).
     * For GRAND_FINALE: triggers prize payout when declared.
     * Only one submission per rank per event+round is enforced in service.
     */
    rank: {
      type: Number,
    },

    isWinner: {
      type: Boolean,
      default: false,
    },

    // -----------------------------------------------------------------------
    // FLAGS
    // -----------------------------------------------------------------------
    isLate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// One submission per student per round per event (prevents double registration)
liveCompetitionSubmissionSchema.index(
  { event: 1, participant: 1, round: 1 },
  { unique: true }
);

// Admin qualifier queue — filter qualified students quickly
liveCompetitionSubmissionSchema.index({ event: 1, round: 1, isQualified: 1 });

// Winner lookups per round
liveCompetitionSubmissionSchema.index({ event: 1, round: 1, isWinner: 1 });

// Admin review queue per round
liveCompetitionSubmissionSchema.index({ event: 1, round: 1, evaluationStatus: 1 });

export const LiveCompetitionSubmission = mongoose.model(
  "LiveCompetitionSubmission",
  liveCompetitionSubmissionSchema
);

export default LiveCompetitionSubmission;
