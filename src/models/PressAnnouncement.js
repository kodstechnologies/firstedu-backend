import mongoose from "mongoose";

export const PRESS_ANNOUNCEMENT_TYPES = ["press_release", "news_article", "award", "announcement"];

const pressAnnouncementSchema = new mongoose.Schema(
  {
    pressname: {
      type: String,
      required: [true, "Press name is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: PRESS_ANNOUNCEMENT_TYPES,
        message: `Type must be one of: ${PRESS_ANNOUNCEMENT_TYPES.join(", ")}`,
      },
      required: [true, "Type is required"],
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
    highlights: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.every((item) => typeof item === "string");
        },
        message: "Highlights must be an array of strings",
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

pressAnnouncementSchema.index({ createdAt: -1 });
pressAnnouncementSchema.index({ pressname: 1 });
pressAnnouncementSchema.index({ type: 1 });

export default mongoose.models.PressAnnouncement ||
  mongoose.model("PressAnnouncement", pressAnnouncementSchema);
