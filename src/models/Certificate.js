import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pdfUrl: {
      type: String,
      required: true,
      trim: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    // Optional: label/name for the certificate (e.g. "Mathematics 101 - Completion")
    title: {
      type: String,
      trim: true,
    },
    /** Human-friendly download name (e.g. jee-certificate.pdf); shown in API instead of the S3 URL tail */
    fileName: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

certificateSchema.index({ student: 1, issuedAt: -1 });
certificateSchema.index({ issuedBy: 1 });

export default mongoose.models.Certificate ||
  mongoose.model("Certificate", certificateSchema);
