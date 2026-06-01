import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import gamificationCategoryRepository from "../repository/gamificationCategory.repository.js";
import gamificationCategoryValidator from "../validation/gamificationCategory.validator.js";

export const updateGamificationSubcategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Robustly parse values if sent via multipart/form-data
  if (req.body.totalLevels) {
    req.body.totalLevels = Number(req.body.totalLevels);
  }
  if (req.body.levels && typeof req.body.levels === 'string') {
    try {
      req.body.levels = JSON.parse(req.body.levels);
    } catch (e) {
      delete req.body.levels;
    }
  }

  // 2. Validate payload
  const { error, value } = gamificationCategoryValidator.updateSubcategory.validate(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }

  // 2. Fetch existing subcategory to ensure it exists
  const existing = await gamificationCategoryRepository.updateSubcategory(id, value);
  if (!existing) {
    throw new ApiError(404, "Gamification subcategory not found.");
  }

  return res.status(200).json(
    ApiResponse.success(existing, "Gamification subcategory updated successfully")
  );
});
