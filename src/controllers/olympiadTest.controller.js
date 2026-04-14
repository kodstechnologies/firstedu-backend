import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import olympiadTestService from "../services/olympiadTest.service.js";
import olympiadTestValidator from "../validation/olympiadTest.validator.js";

export const createOlympiadTest = asyncHandler(async (req, res) => {
  const { error, value } = olympiadTestValidator.createOlympiadTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const created = await olympiadTestService.createOlympiadTest(value);
  return res.status(201).json(ApiResponse.success(created, "Olympiad test added successfully"));
});

export const getOlympiadTests = asyncHandler(async (req, res) => {
  const { categoryId, page, limit } = req.query;
  const result = await olympiadTestService.getOlympiadTests({ categoryId, page, limit });
  return res.status(200).json(ApiResponse.success(result.tests, "Olympiad tests fetched successfully", result.pagination));
});

export const updateOlympiadTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = olympiadTestValidator.updateOlympiadTest.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const updated = await olympiadTestService.updateOlympiadTest(id, value);
  return res.status(200).json(ApiResponse.success(updated, "Olympiad test updated successfully"));
});

export const deleteOlympiadTest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await olympiadTestService.deleteOlympiadTest(id);
  return res.status(200).json(ApiResponse.success(null, "Olympiad test deleted successfully"));
});
