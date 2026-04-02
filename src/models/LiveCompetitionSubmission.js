import mongoose from "mongoose";

const liveCompetitionSubmissionSchema = new mongoose.Schema(
  {
    // -------------------------------
    // RELATIONS
    // -------------------------------
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

    // -------------------------------
    // CONTENT
    // -------------------------------
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
          fileSize: Number, // bytes — for size validation audit trail
        },
      ],

      // Generated PDF (for essay auto-export)
      pdfUrl: String,
    },

    // -------------------------------
    // LIVE ESSAY SUPPORT
    // -------------------------------
    startedAt: Date,

    /**
     * Locks the attempt after startEssaySession is called.
     * Prevents the student from starting a second session.
     */
    attemptLocked: {
      type: Boolean,
      default: false,
    },

    submittedAt: Date,

    // -------------------------------
    // PAYMENT
    // -------------------------------
    paymentStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },

    transactionId: String,

    // -------------------------------
    // ADMIN EVALUATION
    // -------------------------------

    /**
     * PENDING = not yet reviewed by admin.
     * CHECKED = admin has viewed and marked this submission as checked.
     */
    evaluationStatus: {
      type: String,
      enum: ["PENDING", "CHECKED"],
      default: "PENDING",
    },

    /**
     * Rank within this event — 1 (gold), 2 (silver), 3 (bronze).
     * Only one submission per rank per event allowed (enforced in service).
     */
    rank: {
      type: Number,
      enum: [1, 2, 3],
    },

    isWinner: {
      type: Boolean,
      default: false,
    },

    // -------------------------------
    // FLAGS
    // -------------------------------
    isLate: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate submission per user per event
liveCompetitionSubmissionSchema.index(
  { event: 1, participant: 1 },
  { unique: true }
);

// Fast lookup of winners per event
liveCompetitionSubmissionSchema.index({ event: 1, isWinner: 1 });

// Fast lookup of unreviewed submissions for admin queue
liveCompetitionSubmissionSchema.index({ event: 1, evaluationStatus: 1 });

export const LiveCompetitionSubmission = mongoose.model(
  "LiveCompetitionSubmission",
  liveCompetitionSubmissionSchema
);

export default LiveCompetitionSubmission;
