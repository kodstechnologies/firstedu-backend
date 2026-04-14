import mongoose from "mongoose";

const jobApplicantSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    resumeUrl: {
      type: String,
      trim: true,
      default: "",
    },
    experience: {
      type: String,
      trim: true,
      default: "",
    },
    currentRole: {
      type: String,
      trim: true,
      default: "",
    },
    highestQualification: {
      type: String,
      trim: true,
      default: "",
    },
    graduationYear: {
      type: String,
      trim: true,
      default: "",
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Carear",
      required: true,
    },
    expectedSalary: {
      type: String,
      trim: true,
      default: "",
    },
    noticePeriod: {
      type: String,
      trim: true,
      default: "",
    },
    // ✅ NEW STRUCTURED INTERVIEW SCHEDULE
    interview_schedule: {
      date: {
        type: Date,
        default: null,
      },
      time: {
        type: String, // e.g. "10:30 AM"
        trim: true,
        default: "",
      },
      meeting_link: {
        type: String,
        trim: true,
        default: "",
      },
    },
    status: {
      type: String,
      enum: ["applied", "review", "shortlisted", "interview", "rejected", "hired"],
      default: "applied",
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// TTL Index: Delete documents 90 days after appliedAt
jobApplicantSchema.index({ appliedAt: 1 }, { expireAfterSeconds: 7776000 });

// Additional indexing for fast searching & filtering by jobId
jobApplicantSchema.index({ jobId: 1 });
jobApplicantSchema.index({ status: 1 });
jobApplicantSchema.index({ email: 1 });

export default mongoose.models.JobApplicant || mongoose.model("JobApplicant", jobApplicantSchema);
