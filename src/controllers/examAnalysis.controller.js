import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import examAnalysisService from "../services/examAnalysis.service.js";
import examAnalysisValidator from "../validation/examAnalysis.validator.js";

// Get Detailed Performance Analysis
export const getDetailedAnalysis = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const { error } = examAnalysisValidator.getDetailedAnalysis.validate({ sessionId });

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const analysis = await examAnalysisService.getDetailedAnalysis(
    sessionId,
    studentId
  );

  return res
    .status(200)
    .json(
      ApiResponse.success(
        analysis,
        "Detailed performance analysis fetched successfully"
      )
    );
});

// Calculate and Update Analysis (can be called after exam submission)
export const calculateAnalysis = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const { error } = examAnalysisValidator.calculateAnalysis.validate({ sessionId });

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  // Verify session belongs to student
  const ExamSession = (await import("../models/ExamSession.js")).default;
  const session = await ExamSession.findOne({
    _id: sessionId,
    student: studentId,
  });

  if (!session) {
    throw new ApiError(404, "Exam session not found");
  }

  const analysis = await examAnalysisService.calculateDetailedAnalysis(
    sessionId
  );

  return res
    .status(200)
    .json(
      ApiResponse.success(
        analysis,
        "Performance analysis calculated successfully"
      )
    );
});

export default {
  getDetailedAnalysis,
  calculateAnalysis,
};

