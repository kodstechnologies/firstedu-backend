import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, trim: true, default: "application/octet-stream" },
    size: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const teacherChatMessageSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherSession",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
      index: true,
    },
    from: {
      type: String,
      enum: ["student", "teacher"],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderName: {
      type: String,
      trim: true,
      default: "",
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    attachment: {
      type: attachmentSchema,
      default: null,
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    clientId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

teacherChatMessageSchema.index({ session: 1, sentAt: 1 });
teacherChatMessageSchema.index({ student: 1, teacher: 1, sentAt: -1 });

export default mongoose.models.TeacherChatMessage ||
  mongoose.model("TeacherChatMessage", teacherChatMessageSchema);
