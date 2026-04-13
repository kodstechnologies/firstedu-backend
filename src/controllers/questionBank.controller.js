import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { throwJoiValidationError } from "../utils/joiValidationError.js";
import questionBankValidator from "../validation/questionBank.validator.js";
import questionBankService from "../services/questionBank.service.js";
import { uploadImageToCloudinary } from "../utils/s3Upload.js";

/**
 * JSON body (application/json) as today, or multipart/form-data with:
 * - field `data`: stringified JSON (same shape as JSON body)
 * - optional files, either:
 *   - `questionImage_<index>` (e.g. questionImage_0) matching `questions[index]`, or
 *   - repeated field `questionImages` in the same order as `questions[]` (dense)
 */
const buildQuestionBankWithQuestionsPayload = async (req) => {
  let payload;
  if (typeof req.body?.data === "string") {
    try {
      payload = JSON.parse(req.body.data);
    } catch {
      throw new ApiError(400, "Invalid JSON in multipart field `data`");
    }
  } else {
    payload = { ...req.body };
  }

  const allFiles = Array.isArray(req.files) ? req.files : [];
  const files = allFiles.filter(
    (f) => f.fieldname === "questionImages" || /^questionImage_\d+$/.test(f.fieldname)
  );
  if (files.length > 500) {
    throw new ApiError(400, "Too many question image files (max 500)");
  }
  if (files.length > 0 && Array.isArray(payload.questions)) {
    const named = [];
    const sequential = [];
    for (const f of files) {
      if (/^questionImage_\d+$/.test(f.fieldname)) {
        const index = Number(f.fieldname.replace(/^questionImage_/, ""));
        if (!Number.isNaN(index)) named.push({ index, file: f });
      } else if (f.fieldname === "questionImages") {
        sequential.push(f);
      }
    }

    const uploads = [];
    if (named.length > 0) {
      for (const { index, file } of named) {
        if (index < 0 || index >= payload.questions.length) continue;
        uploads.push(
          uploadImageToCloudinary(
            file.buffer,
            file.originalname,
            "question-images",
            file.mimetype
          ).then((url) => ({ i: index, url }))
        );
      }
    } else if (sequential.length > 0) {
      const n = Math.min(sequential.length, payload.questions.length);
      for (let i = 0; i < n; i++) {
        const file = sequential[i];
        if (!file) continue;
        uploads.push(
          uploadImageToCloudinary(
            file.buffer,
            file.originalname,
            "question-images",
            file.mimetype
          ).then((url) => ({ i, url }))
        );
      }
    }

    const results = await Promise.all(uploads);
    for (const { i, url } of results) {
      payload.questions[i].imageUrl = url;
    }
  }

  return payload;
};

export const createQuestionBank = asyncHandler(async (req, res) => {
  const { error, value } =
    questionBankValidator.createQuestionBank.validate(req.body);
  if (error) throwJoiValidationError(error);
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
  const payload = await buildQuestionBankWithQuestionsPayload(req);
  const { error, value } =
    questionBankValidator.createQuestionBankWithQuestions.validate(payload);
  if (error) throwJoiValidationError(error);
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
  const { page, limit, search, category, sortBy, sortOrder } = req.query;
  const result = await questionBankService.getQuestionBanks({
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
  if (error) throwJoiValidationError(error);
  const updated = await questionBankService.updateQuestionBank(id, value);
  return res
    .status(200)
    .json(
      ApiResponse.success(updated, "Question bank updated successfully")
    );
});

export const toggleSectionWiseQuestions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } =
    questionBankValidator.toggleSectionWiseQuestions.validate(req.body);
  if (error) throwJoiValidationError(error);

  const updated = await questionBankService.toggleSectionWiseQuestions(
    id,
    value.useSectionWiseQuestions
  );

  return res.status(200).json(
    ApiResponse.success(
      updated,
      `Section-wise questions ${
        value.useSectionWiseQuestions ? "enabled" : "disabled"
      } successfully`
    )
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
