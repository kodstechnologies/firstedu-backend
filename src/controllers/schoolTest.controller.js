import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import schoolTestService from "../services/schoolTest.service.js";
import schoolTestValidator from "../validation/schoolTest.validator.js";

export const createSchoolTest = asyncHandler(async (req, res) => {
  const { error, value } = schoolTestValidator.createSchoolTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const created = await schoolTestService.createSchoolTest(value);
  return res.status(201).json(ApiResponse.success(created, "School test added successfully"));
});

export const getSchoolTests = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  const result = await schoolTestService.getSchoolTests({ categoryId, page, limit });
  return res.status(200).json(ApiResponse.success(result.tests, "School tests fetched successfully", result.pagination));
});

export const updateSchoolTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = schoolTestValidator.updateSchoolTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const updated = await schoolTestService.updateSchoolTest(id, value);
  return res.status(200).json(ApiResponse.success(updated, "School test updated successfully"));
});

export const deleteSchoolTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await schoolTestService.deleteSchoolTest(id);
  return res.status(200).json(ApiResponse.success(null, "School test deleted successfully"));
});
