import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import liveCompetitionService from "../services/liveCompetition.service.js";
import liveCompetitionValidator from "../validation/liveCompetition.validator.js";

// ==================== ADMIN CONTROLLERS ====================

// ─── Event Management ────────────────────────────────────

export const createEvent = asyncHandler(async (req, res) => {
  const { error, value } = liveCompetitionValidator.createEvent.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const event = await liveCompetitionService.createEvent(value, req.user._id, req.file);
  return res.status(201).json(ApiResponse.success(event, "Live competition created successfully"));
});

export const getEvents = asyncHandler(async (req, res) => {
  const { page, limit, search, status, category } = req.query;
  const result = await liveCompetitionService.getEvents({ page, limit, search, status, category });
  return res.status(200).json(
    ApiResponse.success(result.events, "Live competitions fetched successfully", result.pagination)
  );
});

export const getEventById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const event = await liveCompetitionService.getEventById(id);
  return res.status(200).json(ApiResponse.success(event, "Live competition fetched successfully"));
});

export const updateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.updateEvent.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const event = await liveCompetitionService.updateEvent(id, value, req.file);
  return res.status(200).json(ApiResponse.success(event, "Live competition updated successfully"));
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await liveCompetitionService.deleteEvent(id);
  return res.status(200).json(ApiResponse.success(null, "Live competition deleted successfully"));
});

// ─── Submission Management ───────────────────────────────

export const getSubmissionsByEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit } = req.query;
  const result = await liveCompetitionService.getSubmissionsByEvent(id, { page, limit });
  return res.status(200).json(
    ApiResponse.success(
      result.submissions,
      "Submissions fetched successfully",
      result.pagination
    )
  );
});

export const getSubmissionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const submission = await liveCompetitionService.getSubmissionById(id);
  return res.status(200).json(ApiResponse.success(submission, "Submission fetched successfully"));
});

export const reviewSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.reviewSubmission.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const submission = await liveCompetitionService.reviewSubmission(id, value);
  return res.status(200).json(ApiResponse.success(submission, "Submission reviewed successfully"));
});

export const deleteSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await liveCompetitionService.deleteSubmission(id);
  return res.status(200).json(ApiResponse.success(null, "Submission deleted successfully"));
});

// ─── Winner System ────────────────────────────────────────

export const declareWinners = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.declareWinners.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const result = await liveCompetitionService.declareWinners(id, value);
  return res.status(200).json(ApiResponse.success(result, "Winners declared successfully"));
});

export const updateWinners = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.declareWinners.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const result = await liveCompetitionService.updateWinners(id, value);
  return res.status(200).json(ApiResponse.success(result, "Winners updated successfully"));
});

// ─── Analytics ────────────────────────────────────────────

export const getEventStats = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const stats = await liveCompetitionService.getEventStats(id);
  return res.status(200).json(ApiResponse.success(stats, "Event stats fetched successfully"));
});

// ==================== STUDENT CONTROLLERS ====================

export const getPublishedEvents = asyncHandler(async (req, res) => {
  const { page, limit, search, status, category } = req.query;
  const result = await liveCompetitionService.getPublishedEvents({
    page,
    limit,
    search,
    status,
    category,
    studentId: req.user._id,
  });
  return res.status(200).json(
    ApiResponse.success(result.events, "Live competitions fetched successfully", result.pagination)
  );
});

export const getPublishedEventById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const event = await liveCompetitionService.getPublishedEventById(id, req.user._id);
  return res.status(200).json(ApiResponse.success(event, "Live competition fetched successfully"));
});

export const registerForEvent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const registration = await liveCompetitionService.registerForEvent(id, req.user._id);
  return res
    .status(201)
    .json(ApiResponse.success(registration, "Registered for live competition successfully"));
});

export const initiateLiveCompetitionPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const { error, value } = liveCompetitionValidator.initiateLiveCompPayment.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const result = await liveCompetitionService.initiateLiveCompPayment(
    id,
    studentId,
    value.paymentMethod,
    { couponCode: value?.couponCode }
  );

  if (result.completed) {
    return res
      .status(201)
      .json(ApiResponse.success(result.registration, "Registered for live competition successfully"));
  }

  return res
    .status(200)
    .json(ApiResponse.success(result, "Payment order created. Complete payment and call complete-payment API."));
});

export const completeLiveCompetitionRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const { error, value } = liveCompetitionValidator.completeLiveCompPayment.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }

  const registration = await liveCompetitionService.completeLiveCompPayment(id, studentId, value);

  return res
    .status(201)
    .json(ApiResponse.success(registration, "Registered for live competition successfully"));
});

export const submitWork = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.submitWork.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const files = req.files || [];
  const submission = await liveCompetitionService.submitWork(id, req.user._id, value, files);
  return res.status(200).json(ApiResponse.success(submission, "Work submitted successfully"));
});

export const getMySubmissions = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await liveCompetitionService.getMySubmissions(req.user._id, { page, limit });
  return res.status(200).json(
    ApiResponse.success(
      result.submissions,
      "My submissions fetched successfully",
      result.pagination
    )
  );
});

export const startEssaySession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const session = await liveCompetitionService.startEssaySession(id, req.user._id);
  return res
    .status(200)
    .json(ApiResponse.success(session, "Essay session started successfully"));
});

export const saveDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = liveCompetitionValidator.saveDraft.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const draft = await liveCompetitionService.saveDraft(id, req.user._id, value);
  return res.status(200).json(ApiResponse.success(draft, "Draft saved successfully"));
});
