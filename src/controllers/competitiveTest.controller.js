import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import competitiveTestService from "../services/competitiveTest.service.js";
import competitiveTestValidator from "../validation/competitiveTest.validator.js";

export const createCompetitiveTest = asyncHandler(async (req, res) => {
  const { error, value } = competitiveTestValidator.createCompetitiveTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const created = await competitiveTestService.createCompetitiveTest(value);
  return res.status(201).json(ApiResponse.success(created, "Competitive test added successfully"));
});

export const getCompetitiveTests = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  const result = await competitiveTestService.getCompetitiveTests({ categoryId, page, limit });
  return res.status(200).json(ApiResponse.success(result.tests, "Competitive tests fetched successfully", result.pagination));
});

export const updateCompetitiveTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = competitiveTestValidator.updateCompetitiveTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const updated = await competitiveTestService.updateCompetitiveTest(id, value);
  return res.status(200).json(ApiResponse.success(updated, "Competitive test updated successfully"));
});

export const deleteCompetitiveTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await competitiveTestService.deleteCompetitiveTest(id);
  return res.status(200).json(ApiResponse.success(null, "Competitive test deleted successfully"));
});
