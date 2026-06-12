import { ApiError } from "./ApiError.js";
import questionBankRepository from "../repository/questionBank.repository.js";
import aiQuestionBankRepository from "../repository/aiQuestionBank.repository.js";

const getBankId = (bankRef) => bankRef?._id || bankRef;

export const getTestBankType = (test) => {
  if (test?.aiQuestionBank) return "ai";
  if (test?.questionBank) return "manual";
  return null;
};

export const getLinkedBank = (test) => {
  const bankType = getTestBankType(test);
  if (bankType === "ai") {
    return { bank: test.aiQuestionBank, bankType, bankId: getBankId(test.aiQuestionBank) };
  }
  if (bankType === "manual") {
    return { bank: test.questionBank, bankType, bankId: getBankId(test.questionBank) };
  }
  return { bank: null, bankType: null, bankId: null };
};

export const assertTestHasBank = (test) => {
  const { bankId } = getLinkedBank(test);
  if (!bankId) {
    throw new ApiError(400, "Test has no question bank configured");
  }
  return bankId;
};

export const getQuestionsForTest = async (test) => {
  const { bankId, bankType } = getLinkedBank(test);
  if (!bankId) {
    throw new ApiError(400, "Test has no question bank configured");
  }
  if (bankType === "ai") {
    return aiQuestionBankRepository.getQuestionsByBankId(bankId);
  }
  return questionBankRepository.getQuestionsByBankId(bankId);
};

export const getSectionConfigForTiming = (test) => {
  const { bank, bankType } = getLinkedBank(test);
  if (bankType !== "manual") return [];
  if (!bank?.useSectionWiseQuestions || !Array.isArray(bank?.sections)) return [];
  return bank.sections.map((section, index) => ({
    index,
    count: section.count,
    difficulty: section.difficulty,
    timeMinutes: section.timeMinutes || 0,
  }));
};

export const getBankDisplayName = (test) => {
  const { bank } = getLinkedBank(test);
  return bank?.name || null;
};

export const getBankCategories = (test) => {
  const { bank } = getLinkedBank(test);
  return bank?.categories || [];
};
