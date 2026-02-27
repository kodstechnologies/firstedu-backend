import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { generateOTP } from "../utils/otp.js";
import { sendOTPEmail } from "../utils/sendEmail.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";
import studentRepository from "../repository/student.repository.js";
import userValidator from "../validation/student.validator.js";
import studentService from "../services/student.service.js";


// Student Signup
export const signup = asyncHandler(async (req, res) => {
  const { error, value } = userValidator.studentSignup.validate(req.body);

  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map(x => x.message));
  }

  const { email, password, name, schoolOrCollege, classOrGrade, phone, referralCode: inputReferralCode } = value;

  // Handle profile image upload if provided
  let profileImageUrl = null;
  if (req.file) {
    // Validate image file type
    if (!req.file.mimetype.startsWith('image/')) {
      throw new ApiError(400, "Only image files are allowed for profile image");
    }

    try {
      profileImageUrl = await uploadImageToCloudinary(
        req.file.buffer,
        req.file.originalname,
        "student-profile-images",
        req.file.mimetype
      );
    } catch (uploadError) {
      throw new ApiError(500, `Failed to upload profile image: ${uploadError.message}`);
    }
  }

  // 1. Generate Referral Code for the new user
  const referralCode = await studentService.generateReferralCode(name);

  // 2. Validate Referrer (if code provided)
  let referredBy = null;
  if (inputReferralCode) {
    try {
      referredBy = await studentService.validateAndGetReferrerId(inputReferralCode);
    } catch (err) {
      console.error("Error validating referral code:", err);
      // Proceed without referrer (graceful failure)
    }
  }

  // Create student (Password hashing should be handled in the User model pre-save hook)
  const createdStudent = await studentRepository.create({
    email,
    password,
    name,
    schoolOrCollege,
    classOrGrade,
    phone,
    profileImage: profileImageUrl,
    referralCode,
    referredBy,
  });

  if (!createdStudent) {
    throw new ApiError(500, "Something went wrong while registering the student");
  }

  // 3. Update Referrer History and Handle Wallet Rewards (Async - don't block response)
  // We can do both in parallel or sequence, independent of main response
  (async () => {
    if (referredBy) {
      try {
        await studentService.addReferralHistory(referredBy, createdStudent._id);
      } catch (err) {
        console.error("Error updating referral history:", err);
      }
    }

    // Handle Wallet Rewards (New Wallet + Referrer Reward)
    try {
      await studentService.handlePostSignupWalletRewards(createdStudent._id, referredBy);
    } catch (err) {
      console.error("Error handling wallet rewards:", err);
    }
  })();

  return res
    .status(201)
    .json(ApiResponse.success(createdStudent, "Student registered successfully"));
});

// Student Login
export const login = asyncHandler(async (req, res) => {
  const { error, value } = userValidator.studentLogin.validate(req.body);

  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map(x => x.message));
  }

  const { email, password } = value;

  const student = await studentRepository.findOne({ email }, true);

  if (!student) {
    throw new ApiError(404, "Student does not exist");
  }

  if (student.status === "banned") {
    throw new ApiError(403, "You are banned by the admin");
  }

  const isPasswordValid = await student.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const accessToken = student.generateAccessToken();
  const refreshToken = student.generateRefreshToken();

  student.refreshToken = refreshToken;
  student.lastLogin = new Date();
  await studentRepository.save(student);

  const loggedInStudent = await studentRepository.findById(student._id);

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      ApiResponse.success(
        { user: loggedInStudent, accessToken, refreshToken },
        "Student logged in successfully"
      )
    );
});

// 1. Request OTP for forgot password (no authentication required)
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
  const user = await studentRepository.findOne({ email });

  if (!user) {
    throw new ApiError(404, "Email not registered");
  }

  const otp = generateOTP();

  user.passwordResetOTP = otp;
  user.passwordResetOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await studentRepository.save(user);

  await sendOTPEmail(user.email, otp, user.name);

  return res.status(200).json(
    ApiResponse.success({}, "OTP has been sent to your email")
  );
});

// 2. Verify OTP (no authentication required)
export const verifyForgotPasswordOTP = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  if (typeof otp !== 'string' || otp.length !== 6 || !/^[0-9]+$/.test(otp)) {
    throw new ApiError(400, "Invalid OTP format. OTP must be 6 digits.");
  }

  const user = await studentRepository.findOne({ email }, true);

  if (!user) {
    throw new ApiError(404, "Student not found");
  }

  if (!user.passwordResetOTP || !user.passwordResetOTPExpires) {
    throw new ApiError(400, "No OTP request found. Please request OTP first.");
  }

  if (user.passwordResetOTPExpires < Date.now()) {
    // Clear expired OTP
    user.passwordResetOTP = null;
    user.passwordResetOTPExpires = null;
    await studentRepository.save(user);
    throw new ApiError(400, "OTP has expired. Please request a new OTP.");
  }

  if (user.passwordResetOTP !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  // OTP is correct → mark as verified but keep it until password is reset
  return res.status(200).json(
    ApiResponse.success({}, "OTP verified. You can now set new password.")
  );
});

// 3. Reset password (after OTP verification)
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

  const user = await studentRepository.findOne({ email }, true);

  if (!user) {
    throw new ApiError(404, "Student not found");
  }

  // Verify OTP again before allowing password reset
  if (!user.passwordResetOTP || !user.passwordResetOTPExpires) {
    throw new ApiError(400, "No OTP request found. Please request OTP first.");
  }

  if (user.passwordResetOTPExpires < Date.now()) {
    user.passwordResetOTP = null;
    user.passwordResetOTPExpires = null;
    await studentRepository.save(user);
    throw new ApiError(400, "OTP has expired. Please request a new OTP.");
  }

  if (user.passwordResetOTP !== otp) {
    throw new ApiError(400, "Invalid OTP");
  }

  // OTP is valid, reset password
  user.password = newPassword; // pre-save hook will hash it
  user.passwordResetOTP = null;
  user.passwordResetOTPExpires = null;
  await studentRepository.save(user);

  return res.status(200).json(
    ApiResponse.success({}, "Password reset successfully")
  );
});

// Logout
export const logout = asyncHandler(async (req, res) => {
  await studentRepository.updateById(req.user._id, {
    $unset: {
      refreshToken: 1,
    },
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
    .json(ApiResponse.success(null, "Student logged out successfully"));
});

// Get My Profile (current logged-in student)
export const getProfile = asyncHandler(async (req, res) => {
  const student = await studentRepository.findById(req.user._id);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }
  return res
    .status(200)
    .json(ApiResponse.success(student, "Profile fetched successfully"));
});

// Update Profile
export const updateProfile = asyncHandler(async (req, res) => {
  const { error, value } = userValidator.updateProfile.validate(req.body);

  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map(x => x.message));
  }

  const { name, phone, email, schoolOrCollege, classOrGrade } = value;

  // Check if email is being updated and if it's already taken by another user
  if (email) {
    const existingStudent = await studentRepository.findOne({
      email,
      _id: { $ne: req.user._id }
    });
    if (existingStudent) {
      throw new ApiError(409, "Email is already taken by another student");
    }
  }

  // Check if phone is being updated and if it's already taken by another user
  if (phone) {
    const existingStudent = await studentRepository.findOne({
      phone,
      _id: { $ne: req.user._id }
    });
    if (existingStudent) {
      throw new ApiError(409, "Phone number is already taken by another student");
    }
  }

  // Build update object with only provided fields
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;
  if (schoolOrCollege !== undefined) updateData.schoolOrCollege = schoolOrCollege;
  if (classOrGrade !== undefined) updateData.classOrGrade = classOrGrade;

  // Update the student
  const updatedStudent = await studentRepository.updateById(req.user._id, updateData);

  if (!updatedStudent) {
    throw new ApiError(404, "Student not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(updatedStudent, "Profile updated successfully"));
});

// Change password (when logged in)
export const changePassword = asyncHandler(async (req, res) => {
  const { error, value } = userValidator.changePassword.validate(req.body);

  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map(x => x.message));
  }

  const { oldPassword, newPassword } = value;
  const studentId = req.user._id;

  // Get student with password
  const student = await studentRepository.findOne({ _id: studentId }, true);
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  // Verify old password
  const isOldPasswordValid = await student.isPasswordCorrect(oldPassword);
  if (!isOldPasswordValid) {
    throw new ApiError(401, "Old password is incorrect");
  }

  // Check if new password is same as old password
  const isSamePassword = await student.isPasswordCorrect(newPassword);
  if (isSamePassword) {
    throw new ApiError(400, "New password must be different from old password");
  }

  // Update password (pre-save hook will hash it)
  student.password = newPassword;
  await studentRepository.save(student);

  return res.status(200).json(
    ApiResponse.success({}, "Password changed successfully")
  );
});

// Convert Reward Points to Monetary Balance
export const convertPoints = asyncHandler(async (req, res) => {
  const { pointsToConvert } = req.body;
  const studentId = req.user._id;

  if (!pointsToConvert) {
    throw new ApiError(400, "pointsToConvert is required");
  }

  const result = await studentService.convertPointsToMoney(studentId, parseInt(pointsToConvert));

  return res.status(200).json(
    ApiResponse.success(
      result,
      `Successfully converted ${pointsToConvert} points to ${pointsToConvert / 10} balance`
    )
  );
});

// Get Student Profile
export const getProfile = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  // findById should not return password by default
  const student = await studentRepository.findById(studentId);

  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  // Explicitly create a safe object to return, excluding sensitive fields.
  const safeStudentData = {
    _id: student._id,
    name: student.name,
    email: student.email,
    phone: student.phone,
    profileImage: student.profileImage,
    schoolOrCollege: student.schoolOrCollege,
    classOrGrade: student.classOrGrade,
    referralCode: student.referralCode,
    status: student.status,
    createdAt: student.createdAt,
  };

  return res
    .status(200)
    .json(ApiResponse.success(safeStudentData, "Student profile fetched successfully"));
});