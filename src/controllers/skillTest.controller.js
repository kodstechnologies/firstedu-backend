import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import skillTestService from "../services/skillTest.service.js";
import skillTestValidator from "../validation/skillTest.validator.js";

export const createSkillTest = asyncHandler(async (req, res) => {
  const { error, value } = skillTestValidator.createSkillTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const created = await skillTestService.createSkillTest(value);
  return res.status(201).json(ApiResponse.success(created, "Skill test added successfully"));
});

export const getSkillTests = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  const result = await skillTestService.getSkillTests({ categoryId, page, limit });
  return res.status(200).json(ApiResponse.success(result.tests, "Skill tests fetched successfully", result.pagination));
});

export const updateSkillTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = skillTestValidator.updateSkillTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const updated = await skillTestService.updateSkillTest(id, value);
  return res.status(200).json(ApiResponse.success(updated, "Skill test updated successfully"));
});

export const deleteSkillTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await skillTestService.deleteSkillTest(id);
  return res.status(200).json(ApiResponse.success(null, "Skill test deleted successfully"));
});
