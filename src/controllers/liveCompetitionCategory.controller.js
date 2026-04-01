import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import LiveCompetitionCategory from "../models/LiveCompetitionCategory.js";

// ==================== ADMIN ====================

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, submissionType, allowedFileTypes } = req.body;

  if (!name?.trim()) throw new ApiError(400, "Category name is required");

  // submissionType is mandatory — it drives what participants submit
  if (!submissionType || !["TEXT", "FILE"].includes(submissionType)) {
    throw new ApiError(
      400,
      "submissionType is required and must be 'TEXT' or 'FILE'"
    );
  }

  const existing = await LiveCompetitionCategory.findOne({
    name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
  });
  if (existing) throw new ApiError(409, "Category with this name already exists");

  const category = await LiveCompetitionCategory.create({
    name:        name.trim(),
    description: description?.trim() || undefined,
    submissionType,
    // allowedFileTypes only meaningful for FILE type, but accept for both
    allowedFileTypes: Array.isArray(allowedFileTypes)
      ? allowedFileTypes.map((t) => t.toLowerCase().trim())
      : [],
    createdBy: req.user._id,
  });

  return res
    .status(201)
    .json(ApiResponse.success(category, "Category created successfully"));
});

export const getAllCategories = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === "true";
  }
  const categories = await LiveCompetitionCategory.find(filter).sort({ name: 1 });
  return res
    .status(200)
    .json(ApiResponse.success(categories, "Categories fetched successfully"));
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive, submissionType, allowedFileTypes } = req.body;

  const category = await LiveCompetitionCategory.findById(id);
  if (!category) throw new ApiError(404, "Category not found");

  if (name?.trim()) category.name = name.trim();
  if (description !== undefined) category.description = description?.trim() || undefined;
  if (isActive !== undefined) category.isActive = Boolean(isActive);

  if (submissionType !== undefined) {
    if (!["TEXT", "FILE"].includes(submissionType)) {
      throw new ApiError(400, "submissionType must be 'TEXT' or 'FILE'");
    }
    category.submissionType = submissionType;
  }

  if (allowedFileTypes !== undefined) {
    category.allowedFileTypes = Array.isArray(allowedFileTypes)
      ? allowedFileTypes.map((t) => t.toLowerCase().trim())
      : [];
  }

  await category.save();
  return res
    .status(200)
    .json(ApiResponse.success(category, "Category updated successfully"));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await LiveCompetitionCategory.findByIdAndDelete(id);
  if (!category) throw new ApiError(404, "Category not found");
  return res
    .status(200)
    .json(ApiResponse.success(null, "Category deleted successfully"));
});

// ==================== PUBLIC (Student) ====================

export const getActiveCategories = asyncHandler(async (req, res) => {
  const categories = await LiveCompetitionCategory.find({ isActive: true }).sort({ name: 1 });
  return res
    .status(200)
    .json(ApiResponse.success(categories, "Categories fetched successfully"));
});
