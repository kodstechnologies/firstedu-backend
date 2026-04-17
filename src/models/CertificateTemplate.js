import mongoose from "mongoose";

const certificateTemplateSchema = new mongoose.Schema(
  {
    pdfTemplateUrl: {
      type: String,
      required: true,
      trim: true,
    },
    textLayout: {
      type: Object,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.CertificateTemplate ||
  mongoose.model("CertificateTemplate", certificateTemplateSchema);

