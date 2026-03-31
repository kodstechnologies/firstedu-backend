import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: null, trim: true },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    about: { type: String, default: null, trim: true },
    experience: { type: String, default: null, trim: true },
    language: { type: String, default: null, trim: true },
    hiringFor: {
      type: String,
      enum: ["fulltime", "internship", "freelancing"],
      default: null,
      trim: true,
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    perMinuteRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    profileImage: {
      type: String,
      default: null,
      trim: true,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    passwordResetOTP: { type: String, default: null },
    passwordResetOTPExpires: { type: Date, default: null },
    refreshToken: { type: String, default: null },
    fcmToken: { type: String, default: null, trim: true },
    bankDetails: {
      accountHolderName: { type: String, default: null, trim: true },
      accountNumber: { type: String, default: null, trim: true },
      bankName: { type: String, default: null, trim: true },
      ifscCode: { type: String, default: null, trim: true },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Hash password before save
teacherSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Method to compare passwords
teacherSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Method to generate Access Token
teacherSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, email: this.email, userType: "teacher" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "2d" }
  );
};

// Method to generate Refresh Token
teacherSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, email: this.email, userType: "teacher" },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};

export default mongoose.models.Teacher || mongoose.model("Teacher", teacherSchema);

