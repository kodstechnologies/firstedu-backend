import { ApiError } from "../utils/ApiError.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import questionRepository from "../repository/question.repository.js";
import categoryRepository from "../repository/category.repository.js";

const validateQuestionOptions = (questionType, options) => {
  if (
    (questionType === "single" || questionType === "multiple") &&
    options
  ) {
    const correctOptions = options.filter((opt) => opt.isCorrect);
    if (correctOptions.length === 0) {
      throw new ApiError(400, "At least one option must be marked as correct");
    }
    if (questionType === "single" && correctOptions.length > 1) {
      throw new ApiError(
        400,
        "Single choice questions must have exactly one correct answer"
      );
    }
  }
};

export const createQuestionBank = async (data, createdBy) => {
  const categoryIds = data.categories || [];
  for (const catId of categoryIds) {
    const cat = await categoryRepository.findById(catId);
    if (!cat) throw new ApiError(404, `Category not found: ${catId}`);
  }
  const payload = {
    name: data.name,
    categories: categoryIds,
    useSectionWiseDifficulty: data.useSectionWiseDifficulty ?? false,
    overallDifficulty: data.overallDifficulty || "medium",
    sections: data.sections || [],
    createdBy,
  };
  return await questionBankRepository.create(payload);
};

export const createQuestionBankWithQuestions = async (data, createdBy) => {
  const categoryIds = data.categories || [];
  for (const catId of categoryIds) {
    const cat = await categoryRepository.findById(catId);
    if (!cat) throw new ApiError(404, `Category not found: ${catId}`);
  }

  const useSectionWise = data.useSectionWiseDifficulty ?? false;
  const sections = data.sections || [];
  const questionsInput = data.questions || [];
  const overallDifficulty = data.overallDifficulty || "medium";

  let expectedCount = 0;
  if (useSectionWise && sections.length) {
    expectedCount = sections.reduce((sum, s) => sum + s.count, 0);
  } else {
    expectedCount = questionsInput.length;
  }
  if (questionsInput.length !== expectedCount) {
    throw new ApiError(
      400,
      `Number of questions (${questionsInput.length}) must match total count (${expectedCount})`
    );
  }

  const bankPayload = {
    name: data.name,
    categories: categoryIds,
    useSectionWiseDifficulty: useSectionWise,
    overallDifficulty,
    sections,
    createdBy,
  };
  const bank = await questionBankRepository.create(bankPayload);

  let questionIndex = 0;
  const buildDifficultyAndSection = () => {
    if (useSectionWise && sections.length) {
      let idx = 0;
      for (let s = 0; s < sections.length; s++) {
        for (let c = 0; c < sections[s].count; c++) {
          if (idx === questionIndex) {
            return {
              difficulty: sections[s].difficulty,
              sectionIndex: s,
              orderInBank: questionIndex,
            };
          }
          idx++;
        }
      }
    }
    return {
      difficulty: overallDifficulty,
      sectionIndex: undefined,
      orderInBank: questionIndex,
    };
  };

  const createdQuestions = [];
  for (let i = 0; i < questionsInput.length; i++) {
    questionIndex = i;
    const q = questionsInput[i];
    validateQuestionOptions(q.questionType, q.options);
    const { difficulty, sectionIndex, orderInBank } = buildDifficultyAndSection();
    const questionData = {
      questionText: q.questionText,
      questionType: q.questionType || "single",
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      topic: q.topic,
      difficulty,
      marks: q.marks ?? 1,
      negativeMarks: q.negativeMarks ?? 0,
      tags: q.tags,
      subject: q.subject || undefined,
      questionBank: bank._id,
      sectionIndex,
      orderInBank,
      createdBy,
    };
    const created = await questionRepository.create(questionData);
    createdQuestions.push(created);
  }

  const bankWithPopulate = await questionBankRepository.findById(bank._id);
  return {
    questionBank: bankWithPopulate,
    questions: createdQuestions,
  };
};

export const getQuestionBanks = async (options = {}) => {
  return await questionBankRepository.findAll({}, options);
};

export const getQuestionBankById = async (id) => {
  const bank = await questionBankRepository.findById(id);
  if (!bank) throw new ApiError(404, "Question bank not found");
  return bank;
};

export const getQuestionsByBankId = async (bankId) => {
  const bank = await questionBankRepository.findById(bankId);
  if (!bank) throw new ApiError(404, "Question bank not found");
  return await questionBankRepository.getQuestionsByBankId(bankId);
};

export const updateQuestionBank = async (id, updateData) => {
  const existing = await questionBankRepository.findById(id);
  if (!existing) throw new ApiError(404, "Question bank not found");
  if (updateData.categories && updateData.categories.length > 0) {
    for (const catId of updateData.categories) {
      const cat = await categoryRepository.findById(catId);
      if (!cat) throw new ApiError(404, `Category not found: ${catId}`);
    }
  }
  return await questionBankRepository.updateById(id, updateData);
};

export const deleteQuestionBank = async (id) => {
  const existing = await questionBankRepository.findById(id);
  if (!existing) throw new ApiError(404, "Question bank not found");
  await questionBankRepository.deleteQuestionsByBankId(id);
  return await questionBankRepository.deleteById(id);
};

export default {
  createQuestionBank,
  createQuestionBankWithQuestions,
  getQuestionBanks,
  getQuestionBankById,
  getQuestionsByBankId,
  updateQuestionBank,
  deleteQuestionBank,
};
