import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import teacherConnectService from "../services/teacherConnect.service.js";
import teacherConnectValidator from "../validation/teacherConnect.validator.js";
import walletService from "../services/wallet.service.js";
import teacherRepository from "../repository/teacher.repository.js";

/**
 * Get available teachers by subject
 */
export const getAvailableTeachers = asyncHandler(async (req, res) => {
  const { subject, page = 1, limit = 10 } = req.query;
  const studentId = req.user._id;

  // Check wallet balance
  const wallet = await walletService.getWalletBalance(studentId, "User");

  const result = await teacherConnectService.getAvailableTeachers(
    subject,
    parseInt(page),
    parseInt(limit)
  );

  return res.status(200).json(
    ApiResponse.success(
      {
        teachers: result.teachers,
        walletBalance: wallet.monetaryBalance,
      },
      "Available teachers fetched successfully",
      result.pagination
    )
  );
});

/**
 * Initiate call request to a teacher
 */
export const initiateCallRequest = asyncHandler(async (req, res) => {
  const { error, value } = teacherConnectValidator.initiateCallRequest.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const studentId = req.user._id;
  const { teacherId } = req.params;
  const { subject } = value;

  const session = await teacherConnectService.initiateCallRequest(
    studentId,
    teacherId,
    subject
  );

  return res
    .status(201)
    .json(ApiResponse.success(session, "Call request initiated successfully"));
});

/**
 * Get student's call history
 */
export const getCallHistory = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const result = await teacherConnectService.getStudentCallHistory(
    studentId,
    parseInt(page),
    parseInt(limit),
    status || null
  );

  return res.status(200).json(
    ApiResponse.success(
      result.sessions,
      "Call history fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get student's call recordings
 */
export const getCallRecordings = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const result = await teacherConnectService.getStudentRecordings(
    studentId,
    parseInt(page),
    parseInt(limit)
  );

  return res.status(200).json(
    ApiResponse.success(
      result.recordings,
      "Call recordings fetched successfully",
      result.pagination
    )
  );
});

/**
 * Cancel call request
 */
export const cancelCallRequest = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;

  const session = await teacherConnectService.cancelCallRequest(studentId, sessionId);

  return res
    .status(200)
    .json(ApiResponse.success(session, "Call request cancelled successfully"));
});

/**
 * Check wallet balance before connecting
 */
export const checkWalletBalance = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { teacherId } = req.params;

  const wallet = await walletService.getWalletBalance(studentId, "User");

  // Get teacher to check rate
  const teacher = await teacherRepository.findById(teacherId);

  if (!teacher) {
    throw new ApiError(404, "Teacher not found");
  }

  const canAfford = wallet.monetaryBalance >= teacher.perMinuteRate;
  const estimatedCost = teacher.perMinuteRate; // For 1 minute minimum

  return res.status(200).json(
    ApiResponse.success(
      {
        walletBalance: wallet.monetaryBalance,
        teacherRate: teacher.perMinuteRate,
        canAfford,
        estimatedCost,
        message: canAfford
          ? "Sufficient balance to connect"
          : "Insufficient balance. Please recharge your wallet.",
      },
      "Wallet balance checked successfully"
    )
  );
});

export default {
  getAvailableTeachers,
  initiateCallRequest,
  getCallHistory,
  getCallRecordings,
  cancelCallRequest,
  checkWalletBalance,
};

