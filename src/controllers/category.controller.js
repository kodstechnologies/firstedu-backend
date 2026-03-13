import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import categoryValidator from "../validation/category.validator.js";
import categoryService from "../services/category.service.js";

export const createCategory = asyncHandler(async (req, res) => {
  const { error, value } = categoryValidator.createCategory.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const created = await categoryService.createCategory(value, req.user._id);
  return res
    .status(201)
    .json(ApiResponse.success(created, "Category created successfully"));
});

export const getCategories = asyncHandler(async (req, res) => {
  const { page, limit, search, parent, isActive, sortBy, sortOrder } =
    req.query;
  const result = await categoryService.getCategories({
    page,
    limit,
    search,
    parent,
    isActive,
    sortBy,
    sortOrder,
  });
  return res.status(200).json(
    ApiResponse.success(
      result.items,
      "Categories fetched successfully",
      result.pagination
    )
  );
});

export const getCategoryTree = asyncHandler(async (req, res) => {
  const tree = await categoryService.getCategoryTree();
  return res
    .status(200)
    .json(ApiResponse.success(tree, "Category tree fetched successfully"));
});

/**
 * Student-facing: Get all categories (tree or flat) with optional filter.
 * Query: linkedTo=all|questionBank|test|testBundle|both|olympiad|tournament, format=tree|flat
 * - all: union of test + testBundle + olympiad + tournament
 * - questionBank: categories on any question bank
 * - test: only categories used by published tests
 * - testBundle: only categories used by tests inside active test bundles
 * - both: union of test + testBundle
 * - olympiad: categories used by published olympiads (via their test's question bank)
 * - tournament: categories used by published tournaments (via stage tests' question banks)
 */
export const getCategoriesForStudent = asyncHandler(async (req, res) => {
  const { linkedTo, format = "tree" } = req.query;

  const validLinkedTo = ["all", "questionBank", "test", "testBundle", "both", "olympiad", "tournament"].includes(linkedTo) ? linkedTo : null;
  const validFormat = ["tree", "flat"].includes(format) ? format : "tree";

  const result = await categoryService.getCategoriesForStudent({
    linkedTo: validLinkedTo,
    format: validFormat,
  });

  return res.status(200).json(
    ApiResponse.success(
      result,
      validLinkedTo && validLinkedTo !== "all"
        ? `Categories filtered by ${validLinkedTo} fetched successfully`
        : "Categories fetched successfully"
    )
  );
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await categoryService.getCategoryById(id);
  return res
    .status(200)
    .json(ApiResponse.success(item, "Category fetched successfully"));
});

export const getCategoryChildren = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const parentId = id === "root" || id === "null" || !id ? null : id;
  const children = await categoryService.getChildren(parentId);
  return res.status(200).json(
    ApiResponse.success(children, "Child categories fetched successfully")
  );
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = categoryValidator.updateCategory.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await categoryService.updateCategory(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Category updated successfully"));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await categoryService.deleteCategory(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Category deleted successfully"));
});
