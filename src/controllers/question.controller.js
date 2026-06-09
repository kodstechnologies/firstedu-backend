import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import questionValidator from "../validation/question.validator.js";
import questionService from "../services/question.service.js";
import { uploadImageToCloudinary } from "../utils/s3Upload.js";

const DATA_IMAGE_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i;

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

const extFromMime = (mime = "") => {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpg") || mime.includes("jpeg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
};

const uploadBase64ImageIfPresent = async (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(DATA_IMAGE_REGEX);
  if (!match) return null;

  const mimeType = String(match[1] || "").toLowerCase();
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mimeType)) {
    throw new ApiError(400, "Only JPEG, PNG, and WEBP base64 images are supported");
  }

  const rawBase64 = String(match[2] || "").replace(/\s+/g, "");
  const fileBuffer = Buffer.from(rawBase64, "base64");
  if (!fileBuffer?.length) {
    throw new ApiError(400, "Invalid base64 image data");
  }

  const originalName = `question-upload${extFromMime(mimeType)}`;
  return uploadImageToCloudinary(
    fileBuffer,
    originalName,
    "question-images",
    mimeType
  );
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

const buildQuestionPayload = (req) => {
  if (typeof req.body?.data === "string") {
    try {
      return JSON.parse(req.body.data);
    } catch {
      throw new ApiError(400, "Invalid JSON in multipart field `data`");
    }
  }
  return unflattenFormFields(req.body);
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

const normalizeQuestionPayload = (body = {}) => {
  const payload = { ...body };
  // File comes via multer as req.file; ignore any body "image" placeholder/object.
  delete payload.image;

  ["options", "connectedQuestions", "subQuestions", "tags", "correctAnswer", "imageUrl"].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = parseMaybeJSON(payload[key]);
    }
  });

  ["marks", "negativeMarks", "sectionIndex", "orderInBank"].forEach((key) => {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      const n = Number(payload[key]);
      payload[key] = Number.isNaN(n) ? payload[key] : n;
    }
  });

  if (Array.isArray(payload.connectedQuestions)) {
    payload.connectedQuestions = payload.connectedQuestions.map(
      normalizeConnectedSubQuestion
    );
  }
  if (Array.isArray(payload.subQuestions)) {
    payload.subQuestions = payload.subQuestions.map(normalizeConnectedSubQuestion);
  }

  ["isParent"].forEach((key) => {
    if (typeof payload[key] === "string") {
      payload[key] = payload[key].toLowerCase() === "true";
    }
  });

  return payload;
};

const processQuestionFiles = async (req, normalizedPayload) => {
  const allFiles = Array.isArray(req.files) ? req.files : [];
  if (allFiles.length > 0) {
    const uploads = [];

    for (const f of allFiles) {
      // 1. Top-Level Question Images (image)
      if (f.fieldname.match(/^image(\[\d+\]|_\d+)?$/)) {
        uploads.push(
          uploadImageToCloudinary(f.buffer, f.originalname, "question-images", f.mimetype)
            .then(url => ({ type: 'q', url }))
        );
        continue;
      }

      // 2. Top-Level Option Images (optionImage_O)
      let match = f.fieldname.match(/^optionImage_(\d+)$/);
      if (match) {
        const oIndex = Number(match[1]);
        if (normalizedPayload.options && normalizedPayload.options[oIndex]) {
          uploads.push(
            uploadImageToCloudinary(f.buffer, f.originalname, "question-images", f.mimetype)
              .then(url => ({ type: 'opt', oIndex, url }))
          );
        }
        continue;
      }

      // 3. Subquestion Images (subQuestionImage_S)
      match = f.fieldname.match(/^subQuestionImage_(\d+)$/);
      if (match) {
        const sIndex = Number(match[1]);
        const subs = normalizedPayload.subQuestions || normalizedPayload.connectedQuestions;
        if (subs && subs[sIndex]) {
          uploads.push(
            uploadImageToCloudinary(f.buffer, f.originalname, "question-images", f.mimetype)
              .then(url => ({ type: 'sub', sIndex, url }))
          );
        }
        continue;
      }

      // 4. Subquestion Option Images (subQuestionOptionImage_S_O)
      match = f.fieldname.match(/^subQuestionOptionImage_(\d+)_(\d+)$/);
      if (match) {
        const sIndex = Number(match[1]);
        const oIndex = Number(match[2]);
        const subs = normalizedPayload.subQuestions || normalizedPayload.connectedQuestions;
        if (subs && subs[sIndex] && subs[sIndex].options && subs[sIndex].options[oIndex]) {
          uploads.push(
            uploadImageToCloudinary(f.buffer, f.originalname, "question-images", f.mimetype)
              .then(url => ({ type: 'subOpt', sIndex, oIndex, url }))
          );
        }
        continue;
      }
    }

    const results = await Promise.all(uploads);
    for (const res of results) {
      if (res.type === 'q') {
        if (!normalizedPayload.imageUrl) normalizedPayload.imageUrl = [];
        normalizedPayload.imageUrl.push(res.url);
      } else if (res.type === 'opt') {
        normalizedPayload.options[res.oIndex].imageUrl = res.url;
      } else if (res.type === 'sub') {
        const subs = normalizedPayload.subQuestions || normalizedPayload.connectedQuestions;
        if (!subs[res.sIndex].imageUrl) subs[res.sIndex].imageUrl = [];
        subs[res.sIndex].imageUrl.push(res.url);
      } else if (res.type === 'subOpt') {
        const subs = normalizedPayload.subQuestions || normalizedPayload.connectedQuestions;
        subs[res.sIndex].options[res.oIndex].imageUrl = res.url;
      }
    }
  } else if (req.file) { // fallback for single image
    const url = await uploadImageToCloudinary(req.file.buffer, req.file.originalname, "question-images", req.file.mimetype);
    if (!normalizedPayload.imageUrl) normalizedPayload.imageUrl = [];
    normalizedPayload.imageUrl.push(url);
  }

  // Base64 fallback handling (only if no images uploaded via file for main question)
  if (!normalizedPayload.imageUrl || normalizedPayload.imageUrl.length === 0) {
    const fallbackBase64Source = typeof req.body?.image === "string" ? req.body.image : undefined;
    const uploadedUrl = await uploadBase64ImageIfPresent(fallbackBase64Source);
    if (uploadedUrl) {
      if (!normalizedPayload.imageUrl) normalizedPayload.imageUrl = [];
      normalizedPayload.imageUrl.push(uploadedUrl);
    }
  }
};

// Create Question
export const createQuestion = asyncHandler(async (req, res) => {
  const rawPayload = buildQuestionPayload(req);
  const normalizedPayload = normalizeQuestionPayload(rawPayload);

  await processQuestionFiles(req, normalizedPayload);

  const { error, value } = questionValidator.createQuestion.validate(normalizedPayload);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const createdQuestion = await questionService.createQuestion(
    value,
    req.user._id
  );

  return res
    .status(201)
    .json(
      ApiResponse.success(
        createdQuestion,
        "Question created successfully"
      )
    );
});

// Get All Questions (with filters and pagination)
export const getAllQuestions = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    subject,
    topic,
    difficulty,
    questionType,
    isParent,
    questionBank,
  } = req.query;

  const filterOptions = {
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    subject,
    topic,
    difficulty,
    questionType,
    isParent,
    questionBank,
  };

  const result = await questionService.getAllQuestions(filterOptions);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.questions,
        "Questions fetched successfully",
        result.pagination
      )
    );
});

// Get Question by ID
export const getQuestionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const question = await questionService.getQuestionById(id);

  return res
    .status(200)
    .json(ApiResponse.success(question, "Question fetched successfully"));
});

// Update Question
export const updateQuestion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const rawPayload = buildQuestionPayload(req);
  const normalizedPayload = normalizeQuestionPayload(rawPayload);

  await processQuestionFiles(req, normalizedPayload);

  const { error, value } = questionValidator.updateQuestion.validate(normalizedPayload);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updatedQuestion = await questionService.updateQuestion(id, value);

  return res
    .status(200)
    .json(
      ApiResponse.success(updatedQuestion, "Question updated successfully")
    );
});

// Delete Question
export const deleteQuestion = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await questionService.deleteQuestion(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Question deleted successfully"));
});

// Add Child Question to Parent
export const addChildQuestion = asyncHandler(async (req, res) => {
  const { id } = req.params; // parent question id
  const { error, value } = questionValidator.addChildQuestion.validate(
    req.body
  );

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { childQuestionId } = value;

  const updatedParent = await questionService.addChildQuestion(
    id,
    childQuestionId
  );

  return res
    .status(200)
    .json(
      ApiResponse.success(
        updatedParent,
        "Child question added successfully"
      )
    );
});

// Remove Child Question from Parent
export const removeChildQuestion = asyncHandler(async (req, res) => {
  const { id, childId } = req.params; // parent question id and child question id

  const updatedParent = await questionService.removeChildQuestion(id, childId);

  return res
    .status(200)
    .json(
      ApiResponse.success(
        updatedParent,
        "Child question removed successfully"
      )
    );
});

// Get Question Analytics
export const getQuestionAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const analytics = await questionService.getQuestionAnalytics(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(analytics, "Analytics fetched successfully")
    );
});

// Calculate and Update Analytics
export const calculateAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = questionValidator.calculateAnalytics.validate(
    req.body
  );

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const analytics = await questionService.calculateAnalytics(id, value);

  return res.status(200).json(
    ApiResponse.success(
      analytics,
      "Analytics calculated and updated successfully"
    )
  );
});

// Get Analytics for Multiple Questions
export const getBulkAnalytics = asyncHandler(async (req, res) => {
  const { questionIds } = req.body;

  const analytics = await questionService.getBulkAnalytics(questionIds);

  return res
    .status(200)
    .json(
      ApiResponse.success(analytics, "Bulk analytics fetched successfully")
    );
});


