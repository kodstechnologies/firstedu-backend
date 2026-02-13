// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: null },
  password: { type: String, required: true },
  schoolOrCollege: { type: String, trim: true, default: null },
  classOrGrade: { type: String, trim: true, default: null },
  profileImage: { type: String, default: null, trim: true },
  passwordResetOTP: { type: String, default: null },
  passwordResetOTPExpires: { type: Date, default: null },
  // 👇 New fields for tokens
  refreshToken: { type: String, default: null },
  // FCM token for push notifications
  fcmToken: { type: String, default: null },
  // 👇 Referral System Fields
  referralCode: { type: String, unique: true, sparse: true }, // generated on signup
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of users invited by this user
  // 👇 Admin: status (active/banned) and last login
  status: { type: String, enum: ["active", "banned"], default: "active" },
  lastLogin: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// ✅ Hash password before save
studentSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// ✅ Method to compare passwords
studentSchema.methods.isPasswordCorrect = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 👇 Method to generate Access Token
studentSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, phone: this.phone },
    process.env.ACCESS_TOKEN_SECRET,

    { expiresIn: "2d" }
  );
};

// 👇 Method to generate Refresh Token
studentSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, phone: this.phone },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};

export default mongoose.models.User || mongoose.model("User", studentSchema);
