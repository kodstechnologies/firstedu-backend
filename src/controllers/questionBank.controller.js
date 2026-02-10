import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import questionBankValidator from "../validation/questionBank.validator.js";
import questionBankService from "../services/questionBank.service.js";

export const createQuestionBank = asyncHandler(async (req, res) => {
  const { error, value } =
    questionBankValidator.createQuestionBank.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const created = await questionBankService.createQuestionBank(
    value,
    req.user._id
  );
  return res
    .status(201)
    .json(
      ApiResponse.success(created, "Question bank created successfully")
    );
});

export const createQuestionBankWithQuestions = asyncHandler(async (req, res) => {
  const { error, value } =
    questionBankValidator.createQuestionBankWithQuestions.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const result = await questionBankService.createQuestionBankWithQuestions(
    value,
    req.user._id
  );
  return res.status(201).json(
    ApiResponse.success(
      result,
      "Question bank and questions created successfully"
    )
  );
});

export const getQuestionBanks = asyncHandler(async (req, res) => {
  const { page, limit, search, classType, sortBy, sortOrder } = req.query;
  const result = await questionBankService.getQuestionBanks({
    page,
    limit,
    search,
    classType,
    sortBy,
    sortOrder,
  });
  return res.status(200).json(
    ApiResponse.success(
      result.items,
      "Question banks fetched successfully",
      result.pagination
    )
  );
});

export const getQuestionBankById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bank = await questionBankService.getQuestionBankById(id);
  return res
    .status(200)
    .json(ApiResponse.success(bank, "Question bank fetched successfully"));
});

export const getQuestionsByBankId = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const questions = await questionBankService.getQuestionsByBankId(id);
  return res
    .status(200)
    .json(
      ApiResponse.success(questions, "Questions fetched successfully")
    );
});

export const updateQuestionBank = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } =
    questionBankValidator.updateQuestionBank.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await questionBankService.updateQuestionBank(id, value);
  return res
    .status(200)
    .json(
      ApiResponse.success(updated, "Question bank updated successfully")
    );
});

export const deleteQuestionBank = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await questionBankService.deleteQuestionBank(id);
  return res
    .status(200)
    .json(
      ApiResponse.success(null, "Question bank deleted successfully")
    );
});
