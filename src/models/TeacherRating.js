import mongoose from "mongoose";

const teacherRatingSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true }
);

// One rating per student per teacher (update existing when rating again)
teacherRatingSchema.index({ teacher: 1, student: 1 }, { unique: true });

export default mongoose.models.TeacherRating ||
  mongoose.model("TeacherRating", teacherRatingSchema);
