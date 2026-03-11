import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      default: "",
    },
  },
  { timestamps: true }
);

emailTemplateSchema.index({ category: 1, slug: 1 }, { unique: true });

export default mongoose.models.EmailTemplate ||
  mongoose.model("EmailTemplate", emailTemplateSchema);
