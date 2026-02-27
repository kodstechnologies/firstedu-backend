import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import teacherConnectService from "../services/teacherConnect.service.js";
import teacherConnectValidator from "../validation/teacherConnect.validator.js";
import teacherRepository from "../repository/teacher.repository.js";
import { uploadImageToCloudinary } from "../utils/cloudinaryUpload.js";

/**
 * Update teacher profile (teacher can update only: name, email, gender, about, profileImage)
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.updateTeacherProfile.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const teacherId = req.user._id;
  const updateData = {};

  if (value.name !== undefined) updateData.name = value.name;
  if (value.email !== undefined) {
    const existing = await teacherRepository.findOne({ email: value.email });
    if (existing && existing._id.toString() !== teacherId.toString()) {
      throw new ApiError(409, "Email is already in use by another teacher");
    }
    updateData.email = value.email;
  }
  if (value.gender !== undefined) updateData.gender = value.gender;
  if (value.about !== undefined) updateData.about = value.about;

  const profileImageFile = req.file;
  if (profileImageFile && profileImageFile.buffer) {
    if (!profileImageFile.mimetype.startsWith("image/")) {
      throw new ApiError(400, "Profile image must be an image file");
    }
    updateData.profileImage = await uploadImageToCloudinary(
      profileImageFile.buffer,
      profileImageFile.originalname,
      "teacher-profile-images",
      profileImageFile.mimetype
    );
  }

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const teacher = await teacherRepository.updateById(teacherId, updateData);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(teacher, "Profile updated successfully"));
});

/**
 * Toggle availability (Go Live)
 */
export const toggleAvailability = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.toggleAvailability.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const teacherId = req.user._id;

  // Check if teacher is approved
  const teacher = await teacherRepository.findById(teacherId);
  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  if (teacher.status !== "approved") {
    throw new ApiError(400, "Teacher must be approved to go live");
  }

  if (value.isLive && teacher.perMinuteRate <= 0) {
    throw new ApiError(400, "Please set your per-minute rate before going live");
  }

  if (value.isLive && (!teacher.skills || teacher.skills.length === 0)) {
    throw new ApiError(400, "Please add at least one subject/skill before going live");
  }

  const updatedTeacher = await teacherRepository.updateById(teacherId, {
    isLive: value.isLive,
  });

  return res.status(200).json(
    ApiResponse.success(
      updatedTeacher,
      value.isLive ? "You are now live" : "You are now offline"
    )
  );
});

/**
 * Get pending call requests
 */
export const getPendingRequests = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;

  const requests = await teacherConnectService.getTeacherPendingRequests(teacherId);

  return res
    .status(200)
    .json(ApiResponse.success(requests, "Pending requests fetched successfully"));
});

/**
 * Accept incoming call request
 */
export const acceptCallRequest = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const { sessionId } = req.params;

  const session = await teacherConnectService.acceptCallRequest(teacherId, sessionId);

  return res
    .status(200)
    .json(ApiResponse.success(session, "Call request accepted successfully"));
});

/**
 * Reject incoming call request
 */
export const rejectCallRequest = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.rejectCallRequest.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const teacherId = req.user._id;
  const { sessionId } = req.params;
  const { reason } = value;

  const session = await teacherConnectService.rejectCallRequest(teacherId, sessionId, reason);

  return res
    .status(200)
    .json(ApiResponse.success(session, "Call request rejected successfully"));
});

/**
 * Start call (when Twilio call is connected)
 */
export const startCall = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.startCall.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { sessionId } = req.params;
  const { twilioCallSid } = value;

  const session = await teacherConnectService.startCall(sessionId, twilioCallSid);

  return res
    .status(200)
    .json(ApiResponse.success(session, "Call started successfully"));
});

/**
 * End call and process billing
 */
export const endCall = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.endCall.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { sessionId } = req.params;
  const { durationMinutes, recordingUrl, recordingSid } = value;

  const session = await teacherConnectService.endCall(
    sessionId,
    durationMinutes,
    recordingUrl,
    recordingSid
  );

  return res
    .status(200)
    .json(ApiResponse.success(session, "Call ended and billing processed successfully"));
});

/**
 * Get teacher's session history
 */
export const getSessionHistory = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const result = await teacherConnectService.getTeacherSessionHistory(
    teacherId,
    parseInt(page),
    parseInt(limit),
    status || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.sessions,
      "Session history fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get teacher's earnings
 */
export const getEarnings = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const { startDate, endDate } = req.query;

  const earnings = await teacherConnectService.getTeacherEarnings(
    teacherId,
    startDate || null,
    endDate || null
  );

  return res
    .status(200)
    .json(ApiResponse.success(earnings, "Earnings fetched successfully"));
});

export default {
  updateProfile,
  toggleAvailability,
  getPendingRequests,
  acceptCallRequest,
  rejectCallRequest,
  startCall,
  endCall,
  getSessionHistory,
  getEarnings,
};

