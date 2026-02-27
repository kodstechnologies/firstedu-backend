import mongoose from "mongoose";

export const APPLICATION_STATUS = ["applied", "interview_scheduled", "approved", "rejected"];

const jobApplicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApplyJob",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
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
    resume: {
      type: String,
      required: [true, "Resume (PDF) is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: APPLICATION_STATUS,
        message: `Status must be one of: ${APPLICATION_STATUS.join(", ")}`,
      },
      default: "applied",
    },
    // Interview details (set by admin when scheduling)
    interviewDate: { type: Date, default: null },
    interviewTime: { type: String, trim: true, default: null },
    interviewProvider: { type: String, trim: true, default: null },
    providerLink: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

jobApplicationSchema.index({ job: 1 });
jobApplicationSchema.index({ email: 1 });
jobApplicationSchema.index({ status: 1 });

export default mongoose.models.JobApplication || mongoose.model("JobApplication", jobApplicationSchema);
