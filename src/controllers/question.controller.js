import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import questionValidator from "../validation/question.validator.js";
import questionService from "../services/question.service.js";
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

const normalizeQuestionPayload = (body = {}) => {
  const payload = { ...body };
  ["options", "connectedQuestions", "subQuestions", "tags", "correctAnswer"].forEach((key) => {
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

  ["isParent"].forEach((key) => {
    if (typeof payload[key] === "string") {
      payload[key] = payload[key].toLowerCase() === "true";
    }
  });

  return payload;
};

// Create Question
export const createQuestion = asyncHandler(async (req, res) => {
  const normalizedPayload = normalizeQuestionPayload(req.body);

  if (req.file) {
    normalizedPayload.imageUrl = await uploadImageToCloudinary(
      req.file.buffer,
      req.file.originalname,
      "question-images",
      req.file.mimetype
    );
  }

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
  const normalizedPayload = normalizeQuestionPayload(req.body);

  if (req.file) {
    normalizedPayload.imageUrl = await uploadImageToCloudinary(
      req.file.buffer,
      req.file.originalname,
      "question-images",
      req.file.mimetype
    );
  }

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


