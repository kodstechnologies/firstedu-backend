import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import qnaService from "../services/qna.service.js";
import qnaRequestService from "../services/qnaRequest.service.js";
import qnaValidator from "../validation/qna.validator.js";
import qnaRequestValidator from "../validation/qnaRequest.validator.js";

// ==================== ADMIN – Q&A (create, list, get, update, delete) ====================

/**
 * Create Q&A (admin)
 * POST /admin/qna
 */
export const createQnA = asyncHandler(async (req, res) => {
  const { error, value } = qnaValidator.createQnA.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const qna = await qnaService.createQnA(value, req.user._id);
  return res.status(201).json(ApiResponse.success(qna, "Q&A created successfully"));
});

/**
 * Get all Q&A (admin) – optional filter by subject, pagination
 * GET /admin/qna?subject=general&page=1&limit=10
 */
export const getAllQnAAdmin = asyncHandler(async (req, res) => {
  const { subject, page, limit, search } = req.query;
  const filters = {};
  if (subject) filters.subject = subject;
  const result = await qnaService.getAllQnAPaginated(filters, { page, limit, search });
  return res.status(200).json(
    ApiResponse.success(result.list, "Q&A list fetched successfully", result.pagination)
  );
});

/**
 * Get Q&A by ID (admin)
 * GET /admin/qna/:id
 */
export const getQnAByIdAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const qna = await qnaService.getQnAById(id);
  return res.status(200).json(ApiResponse.success(qna, "Q&A fetched successfully"));
});

/**
 * Update Q&A (admin)
 * PUT /admin/qna/:id
 */
export const updateQnA = asyncHandler(async (req, res) => {
  const { error, value } = qnaValidator.updateQnA.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  if (Object.keys(value).length === 0) {
    throw new ApiError(400, "At least one field (question, answer, subject) is required");
  }
  const { id } = req.params;
  const qna = await qnaService.updateQnA(id, value);
  return res.status(200).json(ApiResponse.success(qna, "Q&A updated successfully"));
});

/**
 * Delete Q&A (admin)
 * DELETE /admin/qna/:id
 */
export const deleteQnA = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await qnaService.deleteQnA(id);
  return res.status(200).json(ApiResponse.success(null, "Q&A deleted successfully"));
});

// ==================== ADMIN – Q&A requests (list, get by id) ====================

/**
 * Get all Q&A requests from users (admin)
 * GET /admin/qna-requests?subject=general&status=pending
 */
export const getAllQnARequests = asyncHandler(async (req, res) => {
  const { subject, status, page, limit, search } = req.query;
  const filters = {};
  if (subject) filters.subject = subject;
  if (status) filters.status = status;
  const result = await qnaRequestService.getAllQnARequests(filters, {
    page,
    limit,
    search,
  });
  return res.status(200).json(
    ApiResponse.success(result.list, "Q&A requests fetched successfully", result.pagination)
  );
});

/**
 * Get Q&A request by ID (admin)
 * GET /admin/qna-requests/:id
 */
export const getQnARequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const request = await qnaRequestService.getQnARequestById(id);
  return res.status(200).json(ApiResponse.success(request, "Q&A request fetched successfully"));
});

// ==================== USER – Q&A (read only: list, get by id) ====================

/**
 * Get all published Q&A for users (admin-created) – pagination
 * GET /user/qna?subject=general&page=1&limit=10
 */
export const getAllQnAUser = asyncHandler(async (req, res) => {
  const { subject, page, limit } = req.query;
  const filters = {};
  if (subject) filters.subject = subject;
  const result = await qnaService.getAllQnAPaginated(filters, { page, limit });
  return res.status(200).json(
    ApiResponse.success(result.list, "Q&A list fetched successfully", result.pagination)
  );
});

/**
 * Get Q&A by ID (user)
 * GET /user/qna/:id
 */
export const getQnAByIdUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const qna = await qnaService.getQnAById(id);
  return res.status(200).json(ApiResponse.success(qna, "Q&A fetched successfully"));
});

// ==================== USER – Q&A request (submit, optional: my requests) ====================

/**
 * Submit Q&A request (user)
 * POST /user/qna-request
 */
export const submitQnARequest = asyncHandler(async (req, res) => {
  const { error, value } = qnaRequestValidator.submitQnARequest.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const request = await qnaRequestService.submitQnARequest(value, req.user._id);
  return res.status(201).json(ApiResponse.success(request, "Q&A request submitted successfully"));
});

/**
 * Get my Q&A requests (user)
 * GET /user/qna-requests
 */
export const getMyQnARequests = asyncHandler(async (req, res) => {
  const list = await qnaRequestService.getMyQnARequests(req.user._id);
  return res.status(200).json(ApiResponse.success(list, "My Q&A requests fetched successfully"));
});

export default {
  createQnA,
  getAllQnAAdmin,
  getQnAByIdAdmin,
  updateQnA,
  deleteQnA,
  getAllQnARequests,
  getQnARequestById,
  getAllQnAUser,
  getQnAByIdUser,
  submitQnARequest,
  getMyQnARequests,
};
