import mongoose from "mongoose";

export const HIRING_FOR_OPTIONS = ["fulltime", "internship", "freelancing"];

const applyJobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.every((item) => typeof item === "string");
        },
        message: "Skills must be an array of strings",
      },
    },
    experience: {
      type: String,
      required: [true, "Experience is required"],
      trim: true,
    },
    hiringFor: {
      type: String,
      enum: {
        values: HIRING_FOR_OPTIONS,
        message: `hiringFor must be one of: ${HIRING_FOR_OPTIONS.join(", ")}`,
      },
      required: [true, "Hiring for (role) is required"],
      trim: true,
    },
    perMinuteRate: {
      type: Number,
      required: [true, "Per minute rate is required"],
      min: 0,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    language: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

applyJobSchema.index({ createdAt: -1 });
applyJobSchema.index({ hiringFor: 1 });

export default mongoose.models.ApplyJob || mongoose.model("ApplyJob", applyJobSchema);
