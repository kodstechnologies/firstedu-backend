import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import qnaValidator from "../validation/qna.validator.js";
import qnaService from "../services/qna.service.js";

// Create QnA
export const createQnA = asyncHandler(async (req, res) => {
  const { error, value } = qnaValidator.createQnA.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const createdQnA = await qnaService.createQnA(value, req.user._id);

  return res
    .status(201)
    .json(ApiResponse.success(createdQnA, "QnA created successfully"));
});

// Get All QnAs
export const getAllQnAs = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder,type, search, subject, status } = req.query;

  const filterOptions = {
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    type:type==="all"?"":type,
  };
  const result = await qnaService.getAllQnAs(filterOptions);
  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.data,
        "QnAs fetched successfully",
        result.pagination
      )
    );
});

export const selfQnAs = asyncHandler(async (req, res) => {
  const { _id } = req.user;

  const qna = await qnaService.selfQnAs(_id);

  return res
    .status(200)
    .json(ApiResponse.success(qna, "QnA fetched successfully"));
});

// Get QnA by ID
export const getQnAById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const qna = await qnaService.getQnAById(id);

  return res
    .status(200)
    .json(ApiResponse.success(qna, "QnA fetched successfully"));
});

// Update QnA
export const updateQnA = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = qnaValidator.updateQnA.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updatedQnA = await qnaService.updateQnA(id, value);

  return res
    .status(200)
    .json(ApiResponse.success(updatedQnA, "QnA updated successfully"));
});

// approve question
export const approveQnA = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updatedQnA = await qnaService.approveQnA(id);

  return res
    .status(200)
    .json(ApiResponse.success(updatedQnA, "QnA updated successfully"));
});

// Delete QnA
export const deleteQnA = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await qnaService.deleteQnA(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "QnA deleted successfully"));
});

export default {
  createQnA,
  getAllQnAs,
  getQnAById,
  updateQnA,
  deleteQnA,
};
