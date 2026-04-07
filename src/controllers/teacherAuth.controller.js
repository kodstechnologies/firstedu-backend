import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { generateOTP } from "../utils/otp.js";
import { sendOTPEmail } from "../utils/sendEmail.js";
import teacherRepository from "../repository/teacher.repository.js";
import teacherValidator from "../validation/teacher.validator.js";

// Teacher Login (teachers are created by admin; no signup)
export const login = asyncHandler(async (req, res) => {
  const { error, value } = teacherValidator.teacherLogin.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { email, password } = value;

  const teacher = await teacherRepository.findOne({ email }, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher does not exist");
  }

  // Check if teacher is approved
  if (teacher.status !== "approved") {
    throw new ApiError(
      403,
      `Your account is ${teacher.status}. Please wait for admin approval.`
    );
  }

  const isPasswordValid = await teacher.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password");
  }

  const accessToken = teacher.generateAccessToken();
  const refreshToken = teacher.generateRefreshToken();

  teacher.refreshToken = refreshToken;
  await teacherRepository.save(teacher);

  const loggedInTeacher = await teacherRepository.findById(teacher._id);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      ApiResponse.success(
        { user: loggedInTeacher, accessToken, refreshToken },
        "Teacher logged in successfully"
      )
    );
});

// Teacher Logout
export const logout = asyncHandler(async (req, res) => {
  await teacherRepository.updateById(req.user._id, {
    refreshToken: null,
    fcmToken: null,
    isLive: false,  // automatically go offline on logout
  });

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(ApiResponse.success(null, "Teacher logged out successfully"));
});

// Request OTP for forgot password (no authentication required)
export const requestForgotPasswordOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Validate email format first
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, "Invalid email format");
  }

  // Check if email exists in database
  const teacher = await teacherRepository.findOne({ email });

  if (!teacher) {
    throw new ApiError(404, "Email not registered");
  }

  const otp = generateOTP();

  teacher.passwordResetOTP = otp;
  teacher.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await teacherRepository.save(teacher);

  await sendOTPEmail(teacher.email, otp, teacher.name);

  return res
    .status(200)
    .json(ApiResponse.success({}, "OTP has been sent to your email"));
});

// Verify OTP (no authentication required)
export const verifyForgotPasswordOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  if (typeof otp !== 'string' || otp.length !== 6 || !/^[0-9]+$/.test(otp)) {
    throw new ApiError(400, "Invalid OTP format. OTP must be 6 digits.");
  }

  const teacher = await teacherRepository.findOne({ email }, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (!teacher.passwordResetOTP || !teacher.passwordResetOTPExpires) {
    throw new ApiError(400, "No OTP request found. Please request OTP first.");
  }

  if (teacher.passwordResetOTPExpires < Date.now()) {
    // Clear expired OTP
    teacher.passwordResetOTP = null;
    teacher.passwordResetOTPExpires = null;
    await teacherRepository.save(teacher);
    throw new ApiError(400, "OTP has expired. Please request a new OTP.");
  }

  if (teacher.passwordResetOTP !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  // OTP is correct → mark as verified but keep it until password is reset
  return res
    .status(200)
    .json(
      ApiResponse.success({}, "OTP verified. You can now set new password.")
    );
});

// Reset password (after OTP verification)
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword, confirmPassword } = req.body;

  if (!email || !otp || !newPassword || !confirmPassword) {
    throw new ApiError(400, "Email, OTP, newPassword, and confirmPassword are required");
  }

  if (newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long");
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  const teacher = await teacherRepository.findOne({ email }, true);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  // Verify OTP again before allowing password reset
  if (!teacher.passwordResetOTP || !teacher.passwordResetOTPExpires) {
    throw new ApiError(400, "No OTP request found. Please request OTP first.");
  }

  if (teacher.passwordResetOTPExpires < Date.now()) {
    teacher.passwordResetOTP = null;
    teacher.passwordResetOTPExpires = null;
    await teacherRepository.save(teacher);
    throw new ApiError(400, "OTP has expired. Please request a new OTP.");
  }

  if (teacher.passwordResetOTP !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  // OTP is valid, reset password
  teacher.password = newPassword; // pre-save hook will hash it
  teacher.passwordResetOTP = null;
  teacher.passwordResetOTPExpires = null;
  await teacherRepository.save(teacher);

  return res
    .status(200)
    .json(ApiResponse.success({}, "Password reset successfully"));
});

// Change password (when logged in)
export const changePassword = asyncHandler(async (req, res) => {
  const { error, value } = teacherValidator.changePassword.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { oldPassword, newPassword } = value;
  const teacherId = req.user._id;

  // Get teacher with password
  const teacher = await teacherRepository.findOne({ _id: teacherId }, true);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  // Verify old password
  const isOldPasswordValid = await teacher.comparePassword(oldPassword);
  if (!isOldPasswordValid) {
    throw new ApiError(401, "Old password is incorrect");
  }

  // Check if new password is same as old password
  const isSamePassword = await teacher.comparePassword(newPassword);
  if (isSamePassword) {
    throw new ApiError(400, "New password must be different from old password");
  }

  // Update password (pre-save hook will hash it)
  teacher.password = newPassword;
  await teacherRepository.save(teacher);

  return res.status(200).json(
    ApiResponse.success({}, "Password changed successfully")
  );
});

export default {
  login,
  logout,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
};

