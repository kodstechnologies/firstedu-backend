import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import Question from "../models/Question.js";
import QuestionBank from "../models/QuestionBank.js";
import { ApiError } from "../utils/ApiError.js";

// ========== Test Repository ==========
const createTest = async (testData) => {
  try {
    const test = await Test.create(testData);
    return await populateQuestionBankWithCategories(Test.findById(test._id));
  } catch (error) {
    throw new ApiError(500, "Failed to create test", error.message);
  }
};

const populateQuestionBankWithCategories = (query) => {
  return query.populate({
    path: "questionBank",
    select: "name categories overallDifficulty",
    populate: { path: "categories", select: "name _id" },
  });
};

const findTestById = async (id, populateOptions = {}) => {
  try {
    let query = Test.findById(id);
    if (populateOptions.questionBank) {
      query = populateQuestionBankWithCategories(query);
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch test", error.message);
  }
};

const findAllTests = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      questionBank,
      category,
      applicableFor,
      isPublished,
    } = options;

    const query = { ...filter };

    if (questionBank) {
      query.questionBank = questionBank;
    }

    if (category) {
      const bankIds = await QuestionBank.find({ categories: category }).distinct("_id");
      query.questionBank = { $in: bankIds };
    }

    if (typeof isPublished !== "undefined") {
      query.isPublished = isPublished === "true" || isPublished === true;
    }

    if (applicableFor) {
      query.applicableFor = applicableFor;
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ title: regex }, { description: regex }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [tests, total] = await Promise.all([
      populateQuestionBankWithCategories(
        Test.find(query).sort(sort).skip(skip).limit(limitNum)
      ),
      Test.countDocuments(query),
    ]);

    return {
      tests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch tests", error.message);
  }
};

const updateTestById = async (id, updateData) => {
  try {
    const updated = await Test.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    return updated
      ? await populateQuestionBankWithCategories(Test.findById(updated._id))
      : null;
  } catch (error) {
    throw new ApiError(500, "Failed to update test", error.message);
  }
};

const deleteTestById = async (id) => {
  try {
    const deleted = await Test.findByIdAndDelete(id);
    if (!deleted) {
      throw new ApiError(404, "Test not found");
    }
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete test", error.message);
  }
};

// ========== TestBundle Repository ==========
const populateBundleTests = (query) => {
  return query.populate({
    path: "tests",
    select: "title durationMinutes questionBank",
    populate: {
      path: "questionBank",
      select: "name categories",
      populate: { path: "categories", select: "name _id" },
    },
  });
};

const createBundle = async (bundleData) => {
  try {
    const bundle = await TestBundle.create(bundleData);
    return await populateBundleTests(TestBundle.findById(bundle._id));
  } catch (error) {
    throw new ApiError(500, "Failed to create bundle", error.message);
  }
};

/**
 * Find bundle IDs that contain the given test (for access check when test is part of a bundle)
 */
const findBundleIdsContainingTest = async (testId) => {
  try {
    const bundles = await TestBundle.find({ tests: testId }).select("_id").lean();
    return bundles.map((b) => b._id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch bundles for test", error.message);
  }
};

const findBundleById = async (id, populateOptions = {}) => {
  try {
    let query = TestBundle.findById(id);
    if (populateOptions.category) {
      query = query.populate("category", populateOptions.category);
    }
    if (populateOptions.tests) {
      query = populateBundleTests(query);
    }
    return await query;
  } catch (error) {
    throw new ApiError(500, "Failed to fetch bundle", error.message);
  }
};

const findAllBundles = async (filter = {}, options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      isActive,
    } = options;

    const query = { ...filter };

    if (typeof isActive !== "undefined") {
      query.isActive = isActive === "true" || isActive === true;
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      query.$or = [{ name: regex }, { description: regex }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [bundles, total] = await Promise.all([
      populateBundleTests(
        TestBundle.find(query).sort(sort).skip(skip).limit(limitNum)
      ),
      TestBundle.countDocuments(query),
    ]);

    return {
      bundles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch bundles", error.message);
  }
};

const updateBundleById = async (id, updateData) => {
  try {
    const updated = await TestBundle.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    return updated
      ? await populateBundleTests(TestBundle.findById(updated._id))
      : null;
  } catch (error) {
    throw new ApiError(500, "Failed to update bundle", error.message);
  }
};

const deleteBundleById = async (id) => {
  try {
    const deleted = await TestBundle.findByIdAndDelete(id);
    if (!deleted) {
      throw new ApiError(404, "Bundle not found");
    }
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete bundle", error.message);
  }
};

// ========== Question Helper Methods ==========
const findQuestionsByIds = async (questionIds, filter = {}) => {
  try {
    return await Question.find({
      _id: { $in: questionIds },
      ...filter,
    }).select("_id marks");
  } catch (error) {
    throw new ApiError(500, "Failed to fetch questions", error.message);
  }
};

const sampleRandomQuestions = async (count) => {
  try {
    const pipeline = [
      { $match: { isActive: true } },
      { $sample: { size: count } },
      { $project: { _id: 1, marks: 1 } },
    ];
    return await Question.aggregate(pipeline);
  } catch (error) {
    throw new ApiError(500, "Failed to sample questions", error.message);
  }
};

/** Sample random questions from a specific question bank */
const sampleRandomQuestionsFromBank = async (questionBankId, count) => {
  try {
    const pipeline = [
      { $match: { questionBank: questionBankId, isActive: true } },
      { $sample: { size: count } },
      { $project: { _id: 1, marks: 1 } },
    ];
    return await Question.aggregate(pipeline);
  } catch (error) {
    throw new ApiError(500, "Failed to sample questions from bank", error.message);
  }
};

/** Get IDs of all published everyday challenge tests */
const findEverydayChallengeTestIds = async () => {
  try {
    const docs = await Test.find({
      isEverydayChallenge: true,
      isPublished: true,
    })
      .select("_id")
      .lean();
    return docs.map((d) => d._id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch everyday challenge tests", error.message);
  }
};

/** Get everyday challenge test IDs grouped by questionBank.overallDifficulty (for Bronze stage) */
const findEverydayChallengeTestsByDifficulty = async () => {
  try {
    const docs = await Test.find({
      isEverydayChallenge: true,
      isPublished: true,
    })
      .select("_id questionBank")
      .populate("questionBank", "overallDifficulty")
      .lean();
    const easy = [];
    const medium = [];
    const hard = [];
    docs.forEach((d) => {
      const diff = d.questionBank?.overallDifficulty || "medium";
      if (diff === "easy") easy.push(d._id);
      else if (diff === "medium") medium.push(d._id);
      else if (diff === "hard") hard.push(d._id);
    });
    return { easy, medium, hard };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch everyday challenge tests by difficulty", error.message);
  }
};

/** Get challenge-yourself test IDs grouped by questionBank.overallDifficulty */
const findChallengeYourselfTestsByDifficulty = async () => {
  try {
    const docs = await Test.find({
      applicableFor: "challenge_yourself",
      isPublished: true,
    })
      .select("_id questionBank")
      .populate("questionBank", "overallDifficulty")
      .lean();
    const easy = [];
    const medium = [];
    const hard = [];
    docs.forEach((d) => {
      const diff = d.questionBank?.overallDifficulty || "medium";
      if (diff === "easy") easy.push(d._id);
      else if (diff === "medium") medium.push(d._id);
      else if (diff === "hard") hard.push(d._id);
    });
    return { easy, medium, hard };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch challenge-yourself tests", error.message);
  }
};

export default {
  // Test methods
  createTest,
  findTestById,
  findAllTests,
  findEverydayChallengeTestIds,
  findEverydayChallengeTestsByDifficulty,
  findChallengeYourselfTestsByDifficulty,
  updateTestById,
  deleteTestById,
  // Bundle methods
  createBundle,
  findBundleById,
  findBundleIdsContainingTest,
  findAllBundles,
  updateBundleById,
  deleteBundleById,
  // Question helper methods
  findQuestionsByIds,
  sampleRandomQuestions,
  sampleRandomQuestionsFromBank,
};

