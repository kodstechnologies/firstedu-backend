import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { throwJoiValidationError } from "../utils/joiValidationError.js";
import questionBankValidator from "../validation/questionBank.validator.js";
import questionBankService from "../services/questionBank.service.js";
import { uploadImageToCloudinary } from "../utils/s3Upload.js";

const parseMaybeJSON = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const parsePathTokens = (key = "") => {
  const bracketRegex = /([^[\]]+)|\[(.*?)\]/g;
  const tokens = [];
  let match;
  while ((match = bracketRegex.exec(key)) !== null) {
    const raw = match[1] ?? match[2];
    if (raw === undefined || raw === "") continue;
    tokens.push(/^\d+$/.test(raw) ? Number(raw) : raw);
  }
  return tokens;
};

const assignNestedValue = (target, tokens, value) => {
  if (!tokens.length) return;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    if (cursor[current] === undefined) {
      cursor[current] = typeof next === "number" ? [] : {};
    }
    cursor = cursor[current];
  }
  cursor[tokens[tokens.length - 1]] = value;
};

const unflattenFormFields = (body = {}) => {
  const entries = Object.entries(body || {});
  const hasNestedFieldKeys = entries.some(([key]) => key.includes("["));
  if (!hasNestedFieldKeys) return { ...body };

  const result = {};
  for (const [key, value] of entries) {
    const tokens = parsePathTokens(key);
    if (!tokens.length) {
      result[key] = value;
      continue;
    }
    assignNestedValue(result, tokens, value);
  }
  return result;
};

const toNumberIfPossible = (value) => {
  if (value === undefined || value === null || value === "") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
};

const normalizeConnectedSubQuestion = (sub = {}) => {
  const normalized = { ...sub };
  ["options", "correctAnswer"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = parseMaybeJSON(normalized[key]);
    }
  });
  normalized.marks = toNumberIfPossible(normalized.marks);
  normalized.negativeMarks = toNumberIfPossible(normalized.negativeMarks);
  return normalized;
};

const normalizeQuestionItem = (question = {}) => {
  const normalized = { ...question };
  // Ignore UI file placeholders. Actual files are handled via req.files.
  delete normalized.image;
  ["options", "connectedQuestions", "subQuestions", "tags", "correctAnswer"].forEach(
    (key) => {
      if (Object.prototype.hasOwnProperty.call(normalized, key)) {
        normalized[key] = parseMaybeJSON(normalized[key]);
      }
    }
  );

  normalized.marks = toNumberIfPossible(normalized.marks);
  normalized.negativeMarks = toNumberIfPossible(normalized.negativeMarks);

  if (Array.isArray(normalized.connectedQuestions)) {
    normalized.connectedQuestions = normalized.connectedQuestions.map(
      normalizeConnectedSubQuestion
    );
  }
  if (Array.isArray(normalized.subQuestions)) {
    normalized.subQuestions = normalized.subQuestions.map(
      normalizeConnectedSubQuestion
    );
  }

  // Joi expects URI string; sanitize invalid payload values early.
  if (
    Object.prototype.hasOwnProperty.call(normalized, "imageUrl") &&
    normalized.imageUrl !== null &&
    normalized.imageUrl !== undefined &&
    typeof normalized.imageUrl !== "string"
  ) {
    delete normalized.imageUrl;
  }
  if (typeof normalized.imageUrl === "string" && !normalized.imageUrl.trim()) {
    delete normalized.imageUrl;
  }

  return normalized;
};

const normalizeQuestionBankPayload = (input = {}) => {
  const payload = { ...input };
  // Ignore top-level image placeholders; real files come from multer req.files.
  delete payload.image;
  delete payload.questionImages;
  delete payload.questionImage;
  Object.keys(payload).forEach((key) => {
    if (
      /^image_\d+$/.test(key) ||
      /^questionImage_\d+$/.test(key) ||
      /^image\[\d+\]$/.test(key) ||
      /^questionImage\[\d+\]$/.test(key)
    ) {
      delete payload[key];
    }
  });

  ["categories", "sections", "questions"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = parseMaybeJSON(payload[key]);
    }
  });

  if (typeof payload.useSectionWiseDifficulty === "string") {
    payload.useSectionWiseDifficulty =
      payload.useSectionWiseDifficulty.toLowerCase() === "true";
  }
  if (typeof payload.useSectionWiseQuestions === "string") {
    payload.useSectionWiseQuestions =
      payload.useSectionWiseQuestions.toLowerCase() === "true";
  }

  if (Array.isArray(payload.sections)) {
    payload.sections = payload.sections.map((section) => ({
      ...section,
      count: toNumberIfPossible(section?.count),
      id: toNumberIfPossible(section?.id),
    }));
  }

  if (Array.isArray(payload.questions)) {
    payload.questions = payload.questions.map(normalizeQuestionItem);
  }

  return payload;
};

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
    payload = unflattenFormFields(req.body);
  }
  payload = normalizeQuestionBankPayload(payload);

  const allFiles = Array.isArray(req.files) ? req.files : [];
  const files = allFiles.filter(
    (f) =>
      f.fieldname === "questionImages" ||
      f.fieldname === "image" ||
      /^questionImage_\d+$/.test(f.fieldname) ||
      /^image_\d+$/.test(f.fieldname) ||
      /^questionImage\[\d+\]$/.test(f.fieldname) ||
      /^image\[\d+\]$/.test(f.fieldname)
  );
  if (files.length > 500) {
    throw new ApiError(400, "Too many question image files (max 500)");
  }
  if (files.length > 0 && Array.isArray(payload.questions)) {
    const named = [];
    const sequential = [];
    for (const f of files) {
      if (
        /^questionImage_\d+$/.test(f.fieldname) ||
        /^image_\d+$/.test(f.fieldname) ||
        /^questionImage\[\d+\]$/.test(f.fieldname) ||
        /^image\[\d+\]$/.test(f.fieldname)
      ) {
        const index = Number(
          f.fieldname
            .replace(/^questionImage_/, "")
            .replace(/^image_/, "")
            .replace(/^questionImage\[/, "")
            .replace(/^image\[/, "")
            .replace(/\]$/, "")
        );
        if (!Number.isNaN(index)) named.push({ index, file: f });
      } else if (f.fieldname === "questionImages" || f.fieldname === "image") {
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

  if (Array.isArray(payload.questions)) {
    payload.questions = payload.questions.map((q) => {
      const normalizedQuestion = { ...q };
      if (!normalizedQuestion.imageUrl) {
        delete normalizedQuestion.imageUrl;
      }
      return normalizedQuestion;
    });
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
