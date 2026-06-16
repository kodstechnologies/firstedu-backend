import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import aiQuestionBankRepository from "../repository/aiQuestionBank.repository.js";
import categoryRepository from "../repository/category.repository.js";
import { assertAiBankNotInUse } from "../utils/aiBankUsageGuard.js";

const getSectionIndexByCount = (sectionConfigs = [], questionIndex = 0) => {
  let cursor = 0;
  for (let i = 0; i < sectionConfigs.length; i++) {
    const count = Number(sectionConfigs[i]?.count || 0);
    if (questionIndex < cursor + count) return i;
    cursor += count;
  }
  return null;
};

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

export const createAiQuestionBankWithQuestions = async (data, createdBy) => {
  const categoryIds = data.categories || [];
  for (const catId of categoryIds) {
    const cat = await categoryRepository.findById(catId);
    if (!cat) throw new ApiError(404, `Category not found: ${catId}`);
  }

  const bankName = String(data.name || "").trim();
  if (!bankName) throw new ApiError(400, "Bank name is required");

  const duplicate = await aiQuestionBankRepository.findDuplicateName(
    bankName,
    createdBy
  );
  if (duplicate) {
    throw new ApiError(
      400,
      `An AI question bank named "${duplicate.name}" already exists`
    );
  }

  const questionsInput = data.questions || [];
  const overallDifficulty = data.overallDifficulty || "medium";
  const useSectionWise = data.useSectionWise ?? false;
  const sections = useSectionWise ? data.sections || [] : [];

  if (!questionsInput.length) {
    throw new ApiError(400, "At least one question is required");
  }

  if (useSectionWise) {
    if (!sections.length) {
      throw new ApiError(
        400,
        "sections must be configured when section-wise is enabled"
      );
    }
    const expectedCount = sections.reduce(
      (sum, s) => sum + Number(s.count || 0),
      0
    );
    if (questionsInput.length !== expectedCount) {
      throw new ApiError(
        400,
        `Number of questions (${questionsInput.length}) must match total count (${expectedCount})`
      );
    }
  }

  questionsInput.forEach((q, i) => {
    validateQuestionOptions(q.questionType, q.options);
    if (!String(q.explanation || "").trim()) {
      throw new ApiError(400, `Question ${i + 1}: explanation is required`);
    }
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bank = await aiQuestionBankRepository.create(
      {
        name: bankName,
        categories: categoryIds,
        overallDifficulty,
        useSectionWise,
        sections: sections.map((s, idx) => ({
          id: s.id ?? idx + 1,
          name: s.name || `Section ${idx + 1}`,
          count: s.count,
          difficulty: s.difficulty || overallDifficulty,
          timeMinutes: s.timeMinutes ?? 0,
        })),
        aiProvider: data.aiProvider || "gemini",
        generationTopic: data.generationTopic || null,
        questionCount: questionsInput.length,
        createdBy,
      },
      session
    );

    const questionDocs = questionsInput.map((q, i) => {
      const sectionIndex = useSectionWise
        ? getSectionIndexByCount(sections, i)
        : null;
      const sectionDifficulty =
        useSectionWise && sectionIndex !== null
          ? sections[sectionIndex]?.difficulty
          : null;
      return {
        questionText: q.questionText,
        questionType: q.questionType || "single",
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        topic: q.topic,
        difficulty: q.difficulty || sectionDifficulty || overallDifficulty,
        marks: q.marks ?? 1,
        negativeMarks: q.negativeMarks ?? 0,
        tags: q.tags,
        aiBatchNumber: q.aiBatchNumber ?? null,
        sectionIndex,
        aiQuestionBank: bank._id,
        orderInBank: i,
        createdBy,
      };
    });

    const createdQuestions = await aiQuestionBankRepository.insertQuestions(
      questionDocs,
      session
    );

    await session.commitTransaction();

    const populatedBank = await aiQuestionBankRepository.findById(bank._id);
    return {
      bank: populatedBank,
      questions: createdQuestions,
    };
  } catch (error) {
    await session.abortTransaction();
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Failed to create AI question bank with questions",
      error.message
    );
  } finally {
    session.endSession();
  }
};

export const getAiQuestionBanks = async (options = {}) => {
  return aiQuestionBankRepository.findAll({}, options);
};

export const getAiQuestionBankById = async (id) => {
  const bank = await aiQuestionBankRepository.findById(id);
  if (!bank) throw new ApiError(404, "AI question bank not found");
  return bank;
};

export const getAiQuestionsByBankId = async (bankId, options = {}) => {
  const bank = await aiQuestionBankRepository.findById(bankId, false);
  if (!bank) throw new ApiError(404, "AI question bank not found");
  return aiQuestionBankRepository.getQuestionsByBankId(bankId, options);
};

export const deleteAiQuestionBank = async (id) => {
  const bank = await aiQuestionBankRepository.findById(id, false);
  if (!bank) throw new ApiError(404, "AI question bank not found");
  await assertAiBankNotInUse(id, "delete");
  await aiQuestionBankRepository.deleteQuestionsByBankId(id);
  return aiQuestionBankRepository.deleteById(id);
};

export default {
  createAiQuestionBankWithQuestions,
  getAiQuestionBanks,
  getAiQuestionBankById,
  getAiQuestionsByBankId,
  deleteAiQuestionBank,
};
