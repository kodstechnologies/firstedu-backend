import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import classTypeValidator from "../validation/classType.validator.js";
import classTypeService from "../services/classType.service.js";

export const createClassType = asyncHandler(async (req, res) => {
  const { error, value } = classTypeValidator.createClassType.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const created = await classTypeService.createClassType(value, req.user._id);
  return res
    .status(201)
    .json(ApiResponse.success(created, "Class type created successfully"));
});

export const getClassTypes = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive, sortBy, sortOrder } = req.query;
  const result = await classTypeService.getClassTypes({
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
        result.items,
        "Class types fetched successfully",
        result.pagination
      )
    );
});

export const getClassTypeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await classTypeService.getClassTypeById(id);
  return res
    .status(200)
    .json(ApiResponse.success(item, "Class type fetched successfully"));
});

export const updateClassType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = classTypeValidator.updateClassType.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await classTypeService.updateClassType(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Class type updated successfully"));
});

export const deleteClassType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await classTypeService.deleteClassType(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Class type deleted successfully"));
});
