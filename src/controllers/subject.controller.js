import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import subjectValidator from "../validation/subject.validator.js";
import subjectService from "../services/subject.service.js";

export const createSubject = asyncHandler(async (req, res) => {
  const { error, value } = subjectValidator.createSubject.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const created = await subjectService.createSubject(value, req.user._id);
  return res
    .status(201)
    .json(ApiResponse.success(created, "Subject created successfully"));
});

export const getSubjects = asyncHandler(async (req, res) => {
  const { page, limit, search, classType, isActive, sortBy, sortOrder } =
    req.query;
  const result = await subjectService.getSubjects({
    page,
    limit,
    search,
    classType,
    isActive,
    sortBy,
    sortOrder,
  });
  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.items,
        "Subjects fetched successfully",
        result.pagination
      )
    );
});

export const getSubjectsByClassType = asyncHandler(async (req, res) => {
  const { classTypeId } = req.params;
  const items = await subjectService.getSubjectsByClassType(classTypeId);
  return res
    .status(200)
    .json(ApiResponse.success(items, "Subjects fetched successfully"));
});

export const getSubjectById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const item = await subjectService.getSubjectById(id);
  return res
    .status(200)
    .json(ApiResponse.success(item, "Subject fetched successfully"));
});

export const updateSubject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = subjectValidator.updateSubject.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }
  const updated = await subjectService.updateSubject(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Subject updated successfully"));
});

export const deleteSubject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await subjectService.deleteSubject(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Subject deleted successfully"));
});
