import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import examSessionService from "../services/examSession.service.js";

/**
 * Start a new exam session
 */
export const startExam = asyncHandler(async (req, res) => {
  const { testId } = req.params;
  const { categoryId } = req.body || {};
  const studentId = req.user._id;

  const examSession = await examSessionService.startExamSession(testId, studentId, { categoryId });

  return res.status(201).json(
    ApiResponse.success(examSession, "Exam session started successfully")
  );
});

/**
 * Get exam session (with questions, timer, palette)
 */
export const getExamSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const examSession = await examSessionService.getExamSession(sessionId, studentId);

  return res.status(200).json(
    ApiResponse.success(examSession, "Exam session fetched successfully")
  );
});

/**
 * Save answer for a question
 */
export const saveAnswer = asyncHandler(async (req, res) => {
  const { sessionId, questionId } = req.params;
  const { answer, status } = req.body;
  const studentId = req.user._id;

  const examSession = await examSessionService.saveAnswer(
    sessionId,
    questionId,
    answer,
    studentId,
    status
  );

  return res.status(200).json(
    ApiResponse.success(examSession, "Answer saved successfully")
  );
});

/**
 * Mark question for review
 */
export const markForReview = asyncHandler(async (req, res) => {
  const { sessionId, questionId } = req.params;
  const studentId = req.user._id;

  const examSession = await examSessionService.markForReview(sessionId, questionId, studentId);

  return res.status(200).json(
    ApiResponse.success(examSession, "Question marked for review")
  );
});

/**
 * Skip question
 */
export const skipQuestion = asyncHandler(async (req, res) => {
  const { sessionId, questionId } = req.params;
  const studentId = req.user._id;

  const examSession = await examSessionService.skipQuestion(sessionId, questionId, studentId);

  return res.status(200).json(
    ApiResponse.success(examSession, "Question skipped")
  );
});

/**
 * Visit/Open a question (pause previous question timer, resume selected question timer)
 */
export const visitQuestion = asyncHandler(async (req, res) => {
  const { sessionId, questionId } = req.params;
  const studentId = req.user._id;

  const examSession = await examSessionService.visitQuestion(
    sessionId,
    questionId,
    studentId
  );

  return res.status(200).json(
    ApiResponse.success(examSession, "Question opened successfully")
  );
});

/**
 * Pause exam session (stops timer; call start-exam to resume)
 */
export const pauseExam = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const result = await examSessionService.pauseExamSession(sessionId, studentId);

  return res.status(200).json(
    ApiResponse.success(result, "Exam paused successfully")
  );
});

/**
 * Log proctoring event
 */
export const logProctoringEvent = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { eventType, metadata } = req.body;
  const studentId = req.user._id;

  if (!eventType) {
    throw new ApiError(400, "Event type is required");
  }

  const result = await examSessionService.logProctoringEvent(
    sessionId,
    eventType,
    metadata,
    studentId
  );

  return res.status(200).json(
    ApiResponse.success(result, "Proctoring event logged")
  );
});

/**
 * Submit exam
 */
export const submitExam = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const results = await examSessionService.submitExam(sessionId, studentId);

  return res.status(200).json(
    ApiResponse.success(results, "Exam submitted successfully")
  );
});

/**
 * Get exam results (instant results with explanations)
 */
export const getExamResults = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const results = await examSessionService.getExamResults(sessionId, studentId);

  return res.status(200).json(
    ApiResponse.success(results, "Exam results fetched successfully")
  );
});

/**
 * Get question palette (navigation grid)
 */
export const getQuestionPalette = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const palette = await examSessionService.getQuestionPalette(sessionId, studentId);

  return res.status(200).json(
    ApiResponse.success(palette, "Question palette fetched successfully")
  );
});

/**
 * Get all paused exams for the student
 */
export const getInProgressExams = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const result = await examSessionService.getInProgressSessions(studentId, page, limit);

  return res.status(200).json(
    ApiResponse.success(result.sessions, "Paused exams fetched successfully", result.pagination)
  );
});

export default {
  startExam,
  pauseExam,
  getExamSession,
  saveAnswer,
  visitQuestion,
  markForReview,
  skipQuestion,
  logProctoringEvent,
  submitExam,
  getExamResults,
  getQuestionPalette,
  getInProgressExams,
};
