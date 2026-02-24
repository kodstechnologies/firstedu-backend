import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    isLive: { type: Boolean, default: false },
  },
  { _id: true }
);

const competitionSchema = new mongoose.Schema(
  {
    // Basic Info
    label: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    category: {
      type: String,
      trim: true,
      index: true,
    },

    icon: {
      type: String,
      default: "📖",
    },

    // 🔗 Link to Test (CORE FIELD)
    test: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: ["Draft", "Active", "Paused", "Archived"],
      default: "Draft",
      index: true,
    },

    // Hero Section
    heroSection: {
      title: String,
      subtitle: String,
      description: String,
    },

    // Exam Schedule
    examInfo: {
      fullName: {
        type: String,
        trim: true,
      },

      examDate: {
        type: Date,
        required: true,
      },

      examTime: {
        type: String,
        required: true,
      },
    },

    // Notices
    notices: [noticeSchema],
  },
  {
    timestamps: true,
    collection: "competitions",
  }
);

export default mongoose.models.Competition ||
  mongoose.model("Competition", competitionSchema);