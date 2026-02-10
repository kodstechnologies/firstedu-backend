import { ApiError } from "../utils/ApiError.js";
import questionRepository from "../repository/question.repository.js";

// Validate question options and correct answer
const validateQuestionOptions = (questionType, options) => {
  if (
    (questionType === "single" || questionType === "multiple") &&
    options
  ) {
    const correctOptions = options.filter((opt) => opt.isCorrect);
    if (correctOptions.length === 0) {
      throw new ApiError(400, "At least one option must be marked as correct");
    }

    // For single choice, ensure only one correct option
    if (questionType === "single" && correctOptions.length > 1) {
      throw new ApiError(
        400,
        "Single choice questions must have exactly one correct answer"
      );
    }
  }
};

// Create Question Service
export const createQuestion = async (questionData, createdBy) => {
  // Add createdBy from authenticated admin
  questionData.createdBy = createdBy;

  // Validate correct answer matches options for single/multiple choice
  validateQuestionOptions(questionData.questionType, questionData.options);

  const question = await questionRepository.create(questionData);
  const createdQuestion = await questionRepository.findById(question._id);

  return createdQuestion;
};

// Get All Questions Service
export const getAllQuestions = async (filterOptions) => {
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
  } = filterOptions;

  const options = {
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

  const result = await questionRepository.findAll({ isActive: true }, options);

  return result;
};

// Get Question by ID Service
export const getQuestionById = async (id) => {
  const question = await questionRepository.findById(id);

  if (!question) {
    throw new ApiError(404, "Question not found");
  }

  return question;
};

// Update Question Service
export const updateQuestion = async (id, updateData) => {
  // Check if question exists
  const existingQuestion = await questionRepository.findById(id);
  if (!existingQuestion) {
    throw new ApiError(404, "Question not found");
  }

  // Validate correct answer if options are being updated
  if (updateData.options && updateData.questionType !== "connected") {
    validateQuestionOptions(
      updateData.questionType || existingQuestion.questionType,
      updateData.options
    );
  }

  const updatedQuestion = await questionRepository.updateById(id, updateData);

  return updatedQuestion;
};

// Delete Question Service
export const deleteQuestion = async (id) => {
  const question = await questionRepository.findById(id);
  if (!question) {
    throw new ApiError(404, "Question not found");
  }

  await questionRepository.deleteById(id);

  return true;
};

// Add Child Question Service
export const addChildQuestion = async (parentId, childQuestionId) => {
  // Check if parent question exists and is a parent
  const parent = await questionRepository.findById(parentId);
  if (!parent) {
    throw new ApiError(404, "Parent question not found");
  }
  if (!parent.isParent) {
    throw new ApiError(400, "Question is not a parent question");
  }

  // Check if child question exists
  const child = await questionRepository.findById(childQuestionId);
  if (!child) {
    throw new ApiError(404, "Child question not found");
  }

  const updatedParent = await questionRepository.addChildQuestion(
    parentId,
    childQuestionId
  );

  return updatedParent;
};

// Remove Child Question Service
export const removeChildQuestion = async (parentId, childId) => {
  const parent = await questionRepository.findById(parentId);
  if (!parent) {
    throw new ApiError(404, "Parent question not found");
  }

  const updatedParent = await questionRepository.removeChildQuestion(
    parentId,
    childId
  );

  return updatedParent;
};

// Get Question Analytics Service
export const getQuestionAnalytics = async (questionId) => {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new ApiError(404, "Question not found");
  }

  const analytics = await questionRepository.getAnalytics(questionId);

  return analytics;
};

// Calculate Analytics Service
export const calculateAnalytics = async (questionId, analyticsData) => {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new ApiError(404, "Question not found");
  }

  const {
    upperGroupCorrect,
    lowerGroupCorrect,
    upperGroupTotal,
    lowerGroupTotal,
  } = analyticsData;

  // Calculate P-Value (Difficulty)
  const totalAttempts = upperGroupTotal + lowerGroupTotal;
  const correctAttempts = upperGroupCorrect + lowerGroupCorrect;
  const pValue = totalAttempts > 0 ? correctAttempts / totalAttempts : null;

  // Calculate Discrimination Index
  const upperPercent =
    upperGroupTotal > 0 ? upperGroupCorrect / upperGroupTotal : 0;
  const lowerPercent =
    lowerGroupTotal > 0 ? lowerGroupCorrect / lowerGroupTotal : 0;
  const discriminationIndex = upperPercent - lowerPercent;

  // Update analytics
  const updatedQuestion = await questionRepository.updateAnalytics(
    questionId,
    {
      pValue,
      discriminationIndex,
      totalAttempts,
      correctAttempts,
    }
  );

  return {
    pValue: updatedQuestion.analytics.pValue,
    discriminationIndex: updatedQuestion.analytics.discriminationIndex,
    totalAttempts: updatedQuestion.analytics.totalAttempts,
    correctAttempts: updatedQuestion.analytics.correctAttempts,
    lastCalculated: updatedQuestion.analytics.lastCalculated,
  };
};

// Get Bulk Analytics Service
export const getBulkAnalytics = async (questionIds) => {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new ApiError(400, "questionIds must be a non-empty array");
  }

  const result = await questionRepository.findAll(
    { _id: { $in: questionIds }, isActive: true },
    { limit: questionIds.length }
  );

  const analytics = result.questions.map((q) => ({
    questionId: q._id,
    questionText: q.questionText,
    pValue: q.analytics?.pValue || null,
    discriminationIndex: q.analytics?.discriminationIndex || null,
    totalAttempts: q.analytics?.totalAttempts || 0,
    correctAttempts: q.analytics?.correctAttempts || 0,
    lastCalculated: q.analytics?.lastCalculated || null,
  }));

  return analytics;
};

export default {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  addChildQuestion,
  removeChildQuestion,
  getQuestionAnalytics,
  calculateAnalytics,
  getBulkAnalytics,
};

