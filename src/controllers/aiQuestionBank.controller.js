import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { throwJoiValidationError } from "../utils/joiValidationError.js";
import aiQuestionBankValidator from "../validation/aiQuestionBank.validator.js";
import aiQuestionBankService from "../services/aiQuestionBank.service.js";

export const createAiQuestionBankWithQuestions = asyncHandler(
  async (req, res) => {
    const { error, value } =
      aiQuestionBankValidator.createAiQuestionBankWithQuestions.validate(
        req.body
      );
    if (error) throwJoiValidationError(error);
    const result = await aiQuestionBankService.createAiQuestionBankWithQuestions(
      value,
      req.user._id
    );
    return res.status(201).json(
      ApiResponse.success(
        result,
        "AI question bank and questions created successfully"
      )
    );
  }
);

export const getAiQuestionBanks = asyncHandler(async (req, res) => {
  const { page, limit, search, category, sortBy, sortOrder } = req.query;
  const result = await aiQuestionBankService.getAiQuestionBanks({
    page,
    limit,
    search,
    category,
    sortBy,
    sortOrder,
  });
  return res.status(200).json(
    ApiResponse.success(
      result.items,
      "AI question banks fetched successfully",
      result.pagination
    )
  );
});

export const getAiQuestionBankById = asyncHandler(async (req, res) => {
  const bank = await aiQuestionBankService.getAiQuestionBankById(req.params.id);
  return res
    .status(200)
    .json(ApiResponse.success(bank, "AI question bank fetched successfully"));
});

export const getAiQuestionsByBankId = asyncHandler(async (req, res) => {
  const summary = req.query.summary === "true" || req.query.summary === true;
  const questions = await aiQuestionBankService.getAiQuestionsByBankId(
    req.params.id,
    { summary }
  );
  return res
    .status(200)
    .json(ApiResponse.success(questions, "AI questions fetched successfully"));
});

export const deleteAiQuestionBank = asyncHandler(async (req, res) => {
  await aiQuestionBankService.deleteAiQuestionBank(req.params.id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "AI question bank deleted successfully"));
});

export const updateAiQuestion = asyncHandler(async (req, res) => {
  const { error, value } = aiQuestionBankValidator.updateAiQuestion.validate(
    req.body
  );
  if (error) throwJoiValidationError(error);
  const question = await aiQuestionBankService.updateAiQuestion(
    req.params.id,
    value
  );
  return res
    .status(200)
    .json(ApiResponse.success(question, "AI question updated successfully"));
});
