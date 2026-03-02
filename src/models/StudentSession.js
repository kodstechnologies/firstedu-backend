import mongoose from "mongoose";

/**
 * One session per student (single-device policy).
 * Each login creates a session; logging in elsewhere with forceLogin
 * replaces it. Used for refresh token, FCM, and device context.
 */
const studentSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    refreshToken: { type: String, required: true },
    fcmToken: { type: String, default: null },
    deviceId: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "studentsessions" }
);

export default mongoose.models.StudentSession ||
  mongoose.model("StudentSession", studentSessionSchema);
