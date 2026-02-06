import TestCategory from "../models/TestCategory.js";
import Test from "../models/Test.js";
import TestBundle from "../models/TestBundle.js";
import Question from "../models/Question.js";
import { ApiError } from "../utils/ApiError.js";

// ========== TestCategory Repository ==========
const createCategory = async (categoryData) => {
  try {
    const exists = await TestCategory.findOne({ slug: categoryData.slug });
    if (exists) {
      throw new ApiError(400, "Category with this slug already exists");
    }
    return await TestCategory.create(categoryData);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to create category", error.message);
  }
};

const findCategoryById = async (id) => {
  try {
    return await TestCategory.findById(id);
  } catch (error) {
    throw new ApiError(500, "Failed to fetch category", error.message);
  }
};

const findAllCategories = async (filter = {}, options = {}) => {
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
      query.$or = [{ name: regex }, { slug: regex }, { description: regex }];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const [categories, total] = await Promise.all([
      TestCategory.find(query).sort(sort).skip(skip).limit(limitNum),
      TestCategory.countDocuments(query),
    ]);

    return {
      categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch categories", error.message);
  }
};

const updateCategoryById = async (id, updateData) => {
  try {
    return await TestCategory.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to update category", error.message);
  }
};

const deleteCategoryById = async (id) => {
  try {
    const deleted = await TestCategory.findByIdAndDelete(id);
    if (!deleted) {
      throw new ApiError(404, "Category not found");
    }
    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Failed to delete category", error.message);
  }
};

// ========== Test Repository ==========
const createTest = async (testData) => {
  try {
    const test = await Test.create(testData);
    return await Test.findById(test._id)
      .populate("category", "name slug")
      .populate("questions", "questionText subject topic difficulty marks");
  } catch (error) {
    throw new ApiError(500, "Failed to create test", error.message);
  }
};

const findTestById = async (id, populateOptions = {}) => {
  try {
    let query = Test.findById(id);
    if (populateOptions.category) {
      query = query.populate("category", populateOptions.category);
    }
    if (populateOptions.questions) {
      query = query.populate("questions", populateOptions.questions);
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
      category,
      isPublished,
      selectionMode,
      testType,
    } = options;

    const query = { ...filter };

    if (category) {
      query.category = category;
    }

    if (testType) {
      query.testType = testType;
    }

    if (typeof isPublished !== "undefined") {
      query.isPublished = isPublished === "true" || isPublished === true;
    }

    if (selectionMode) {
      query.selectionMode = selectionMode;
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
      Test.find(query)
        .populate("category", "name slug")
        .populate("questions", "questionText subject topic difficulty marks")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
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
    return await Test.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("category", "name slug")
      .populate("questions", "questionText subject topic difficulty marks");
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
const createBundle = async (bundleData) => {
  try {
    const bundle = await TestBundle.create(bundleData);
    return await bundle.populate("tests", "title durationMinutes totalMarks");
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
      query = query.populate("tests", populateOptions.tests);
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
      category,
      isActive,
    } = options;

    const query = { ...filter };

    if (category) {
      query.category = category;
    }

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
      TestBundle.find(query)
        .populate("category", "name slug")
        .populate("tests", "title durationMinutes totalMarks")
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
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
    return await TestBundle.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("category", "name slug")
      .populate("tests", "title durationMinutes totalMarks");
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

export default {
  // Category methods
  createCategory,
  findCategoryById,
  findAllCategories,
  updateCategoryById,
  deleteCategoryById,
  // Test methods
  createTest,
  findTestById,
  findAllTests,
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
};

