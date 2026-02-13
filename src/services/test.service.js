import { ApiError } from "../utils/ApiError.js";
import testRepository from "../repository/test.repository.js";
import questionBankRepository from "../repository/questionBank.repository.js";

// ------- Tests / Test Builder -------

export const createTest = async (data, adminId) => {
  const bank = await questionBankRepository.findById(data.questionBank);
  if (!bank) throw new ApiError(404, "Question bank not found");

  const test = await testRepository.createTest({
    ...data,
    createdBy: adminId,
  });
  await enrichTestsWithBankStats(test);
  return test;
};

const enrichTestsWithBankStats = async (tests) => {
  const items = Array.isArray(tests) ? tests : [tests];
  const bankIds = items
    .map((t) => t?.questionBank?._id)
    .filter(Boolean)
    .map((id) => id.toString());
  const uniqueIds = [...new Set(bankIds)];
  const statsMap = await questionBankRepository.getBanksStatsBatch(uniqueIds);

  items.forEach((t) => {
    if (t?.questionBank?._id) {
      const key = t.questionBank._id.toString();
      const stats = statsMap.get(key) || { totalQuestions: 0, totalMarks: 0 };
      t.questionBank.totalQuestions = stats.totalQuestions;
      t.questionBank.totalMarks = stats.totalMarks;
    }
  });

  return tests;
};

export const getTests = async (options = {}) => {
  const result = await testRepository.findAllTests({}, options);
  await enrichTestsWithBankStats(result.tests);
  return result;
};

export const getTestById = async (id) => {
  const test = await testRepository.findTestById(id, {
    questionBank: "name categories",
  });
  if (!test) {
    throw new ApiError(404, "Test not found");
  }
  await enrichTestsWithBankStats(test);
  return test;
};

export const updateTest = async (id, data) => {
  const existing = await testRepository.findTestById(id);
  if (!existing) throw new ApiError(404, "Test not found");

  if (data.questionBank) {
    const bank = await questionBankRepository.findById(data.questionBank);
    if (!bank) throw new ApiError(404, "Question bank not found");
  }

  const updated = await testRepository.updateTestById(id, data);
  if (updated) await enrichTestsWithBankStats(updated);
  return updated;
};

export const deleteTest = async (id) => {
  const deleted = await testRepository.deleteTestById(id);
  if (!deleted) {
    throw new ApiError(404, "Test not found");
  }
  return true;
};

// ------- Bundles -------

const enrichBundlesTests = async (bundles) => {
  const items = Array.isArray(bundles) ? bundles : [bundles];
  for (const bundle of items) {
    if (bundle?.tests?.length) {
      await enrichTestsWithBankStats(bundle.tests);
    }
  }
};

export const createBundle = async (data, adminId) => {
  const bundle = await testRepository.createBundle({
    ...data,
    createdBy: adminId,
  });
  await enrichBundlesTests(bundle);
  return bundle;
};

export const getBundles = async (options = {}) => {
  const result = await testRepository.findAllBundles({}, options);
  await enrichBundlesTests(result.bundles);
  return result;
};

export const getBundleById = async (id) => {
  const bundle = await testRepository.findBundleById(id, {
    tests: "title durationMinutes questionBank",
  });
  if (!bundle) {
    throw new ApiError(404, "Bundle not found");
  }
  await enrichBundlesTests(bundle);
  return bundle;
};

export const updateBundle = async (id, data) => {
  const updated = await testRepository.updateBundleById(id, data);
  if (!updated) {
    throw new ApiError(404, "Bundle not found");
  }
  await enrichBundlesTests(updated);
  return updated;
};

export const deleteBundle = async (id) => {
  const deleted = await testRepository.deleteBundleById(id);
  if (!deleted) {
    throw new ApiError(404, "Bundle not found");
  }
  return true;
};

export default {
  createTest,
  getTests,
  getTestById,
  updateTest,
  deleteTest,
  createBundle,
  getBundles,
  getBundleById,
  updateBundle,
  deleteBundle,
};


