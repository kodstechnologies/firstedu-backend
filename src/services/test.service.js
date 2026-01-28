import { ApiError } from "../utils/ApiError.js";
import testRepository from "../repository/test.repository.js";

// ------- Categories -------

export const createCategory = async (data, adminId) => {
  const category = await testRepository.createCategory({
    ...data,
    createdBy: adminId,
  });
  return category;
};

export const getCategories = async (options = {}) => {
  return await testRepository.findAllCategories({}, options);
};

export const getCategoryById = async (id) => {
  const category = await testRepository.findCategoryById(id);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }
  return category;
};

export const updateCategory = async (id, data) => {
  const updated = await testRepository.updateCategoryById(id, data);
  if (!updated) {
    throw new ApiError(404, "Category not found");
  }
  return updated;
};

export const deleteCategory = async (id) => {
  const deleted = await testRepository.deleteCategoryById(id);
  if (!deleted) {
    throw new ApiError(404, "Category not found");
  }
  return true;
};

// ------- Tests / Test Builder -------

const buildRandomQuestions = async (randomConfig) => {
  const docs = await testRepository.sampleRandomQuestions(randomConfig.count);
  if (!docs.length) {
    throw new ApiError(400, "No questions found for the given random config");
  }

  return docs;
};

const calculateTotalMarks = (questions) => {
  return questions.reduce((sum, q) => sum + (q.marks || 0), 0);
};

export const createTest = async (data, adminId) => {
  const selectionMode = data.selectionMode || "manual";
  let questions = [];

  if (selectionMode === "manual") {
    if (data.questions && data.questions.length > 60) {
      throw new ApiError(400, "A test can have maximum 60 questions");
    }
    questions = await testRepository.findQuestionsByIds(data.questions, { isActive: true });
    if (!questions.length) {
      throw new ApiError(400, "No valid questions found for this test");
    }
  } else if (selectionMode === "random") {
    if (data.randomConfig && data.randomConfig.count > 60) {
      throw new ApiError(400, "Random test can have maximum 60 questions");
    }
    if (!data.randomConfig || !data.randomConfig.count) {
      throw new ApiError(400, "randomConfig.count is required for random selection");
    }
    const randomQuestions = await buildRandomQuestions(data.randomConfig);
    questions = randomQuestions;
  } else {
    throw new ApiError(400, "Invalid selectionMode. Use 'manual' or 'random'.");
  }

  const totalMarks = calculateTotalMarks(questions);

  const test = await testRepository.createTest({
    ...data,
    selectionMode,
    questions: questions.map((q) => q._id),
    totalMarks,
    createdBy: adminId,
  });

  return test;
};

export const getTests = async (options = {}) => {
  return await testRepository.findAllTests({}, options);
};

export const getTestById = async (id) => {
  const test = await testRepository.findTestById(id, {
    category: "name slug",
    questions: "questionText subject topic difficulty marks",
  });
  if (!test) {
    throw new ApiError(404, "Test not found");
  }
  return test;
};

export const updateTest = async (id, data) => {
  let updatePayload = { ...data };

  // If questions or selectionMode/randomConfig changed, recompute questions + totalMarks
  if (
    data.questions ||
    data.selectionMode ||
    (data.randomConfig && Object.keys(data.randomConfig).length > 0)
  ) {
    let questions = [];

    const selectionMode = data.selectionMode || "manual";

    if (selectionMode === "manual") {
      if (!data.questions || !data.questions.length) {
        throw new ApiError(
          400,
          "questions array is required for manual selection"
        );
      }
      if (data.questions.length > 60) {
        throw new ApiError(400, "A test can have maximum 60 questions");
      }
      questions = await testRepository.findQuestionsByIds(data.questions, { isActive: true });
      if (!questions.length) {
        throw new ApiError(400, "No valid questions found for this test");
      }
      updatePayload.questions = questions.map((q) => q._id);
      updatePayload.randomConfig = undefined;
    } else {
      if (!data.randomConfig || !data.randomConfig.count) {
        throw new ApiError(
          400,
          "randomConfig with valid count is required for random selection"
        );
      }
      if (data.randomConfig.count > 60) {
        throw new ApiError(400, "Random test can have maximum 60 questions");
      }
      const randomQuestions = await buildRandomQuestions(data.randomConfig);
      questions = randomQuestions;
      updatePayload.questions = questions.map((q) => q._id);
      updatePayload.randomConfig = data.randomConfig;
    }

    updatePayload.totalMarks = calculateTotalMarks(questions);
  }

  const updated = await testRepository.updateTestById(id, updatePayload);

  if (!updated) {
    throw new ApiError(404, "Test not found");
  }
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

export const createBundle = async (data, adminId) => {
  const bundle = await testRepository.createBundle({
    ...data,
    createdBy: adminId,
  });
  return bundle;
};

export const getBundles = async (options = {}) => {
  return await testRepository.findAllBundles({}, options);
};

export const getBundleById = async (id) => {
  const bundle = await testRepository.findBundleById(id, {
    category: "name slug",
    tests: "title durationMinutes totalMarks",
  });
  if (!bundle) {
    throw new ApiError(404, "Bundle not found");
  }
  return bundle;
};

export const updateBundle = async (id, data) => {
  const updated = await testRepository.updateBundleById(id, data);
  if (!updated) {
    throw new ApiError(404, "Bundle not found");
  }
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
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
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


