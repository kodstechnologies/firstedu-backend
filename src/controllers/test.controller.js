import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import testValidator from "../validation/test.validator.js";
import testService from "../services/test.service.js";

// -------- Categories --------

export const createCategory = asyncHandler(async (req, res) => {
  const { error, value } = testValidator.createCategory.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const category = await testService.createCategory(value, req.user._id);

  return res
    .status(201)
    .json(
      ApiResponse.success(category, "Category created successfully")
    );
});

export const getCategories = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive, sortBy, sortOrder } = req.query;

  const result = await testService.getCategories({
    page,
    limit,
    search,
    isActive,
    sortBy,
    sortOrder,
  });

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.categories,
        "Categories fetched successfully",
        result.pagination
      )
    );
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await testService.getCategoryById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(category, "Category fetched successfully")
    );
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = testValidator.updateCategory.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updated = await testService.updateCategory(id, value);

  return res
    .status(200)
    .json(
      ApiResponse.success(updated, "Category updated successfully")
    );
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await testService.deleteCategory(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Category deleted successfully"));
});

// -------- Tests / Test Builder --------

export const createTest = asyncHandler(async (req, res) => {
  const { error, value } = testValidator.createTest.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const test = await testService.createTest(value, req.user._id);

  return res
    .status(201)
    .json(ApiResponse.success(test, "Test created successfully"));
});

export const getTests = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    category,
    testType,
    isPublished,
    selectionMode,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await testService.getTests({
    page,
    limit,
    search,
    category,
    testType,
    isPublished,
    selectionMode,
    sortBy,
    sortOrder,
  });

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.tests,
        "Tests fetched successfully",
        result.pagination
      )
    );
});

export const getTestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const test = await testService.getTestById(id);

  return res
    .status(200)
    .json(ApiResponse.success(test, "Test fetched successfully"));
});

export const updateTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = testValidator.updateTest.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updated = await testService.updateTest(id, value);

  return res
    .status(200)
    .json(ApiResponse.success(updated, "Test updated successfully"));
});

export const deleteTest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await testService.deleteTest(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Test deleted successfully"));
});

// -------- Bundles --------

export const createBundle = asyncHandler(async (req, res) => {
  const { error, value } = testValidator.createBundle.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const bundle = await testService.createBundle(value, req.user._id);

  return res
    .status(201)
    .json(ApiResponse.success(bundle, "Bundle created successfully"));
});

export const getBundles = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    category,
    isActive,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await testService.getBundles({
    page,
    limit,
    search,
    category,
    isActive,
    sortBy,
    sortOrder,
  });

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.bundles,
        "Bundles fetched successfully",
        result.pagination
      )
    );
});

export const getBundleById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bundle = await testService.getBundleById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(bundle, "Bundle fetched successfully")
    );
});

export const updateBundle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = testValidator.updateBundle.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updated = await testService.updateBundle(id, value);

  return res
    .status(200)
    .json(ApiResponse.success(updated, "Bundle updated successfully"));
});

export const deleteBundle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await testService.deleteBundle(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Bundle deleted successfully"));
});

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


