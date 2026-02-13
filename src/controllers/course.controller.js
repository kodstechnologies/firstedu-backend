import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import courseValidator from "../validation/course.validator.js";
import courseService from "../services/course.service.js";

export const createCourse = asyncHandler(async (req, res) => {
  // Validate text fields (file validation is handled by multer)
  const { error, value } = courseValidator.createCourse.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  // Check if PDF file is provided
  if (!req.file) {
    throw new ApiError(400, "PDF file is required");
  }

  const course = await courseService.createCourse(value, req.user._id, req.file);

  return res
    .status(201)
    .json(ApiResponse.success(course, "Course created successfully"));
});

export const getCourses = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    search,
    isPublished,
    sortBy,
    sortOrder,
  } = req.query;

  const result = await courseService.getCourses({
    page,
    limit,
    search,
    isPublished,
    sortBy,
    sortOrder,
  });

  return res
    .status(200)
    .json(
      ApiResponse.success(
        result.courses,
        "Courses fetched successfully",
        result.pagination
      )
    );
});

export const getCourseById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const course = await courseService.getCourseById(id);

  return res
    .status(200)
    .json(ApiResponse.success(course, "Course fetched successfully"));
});

export const updateCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = courseValidator.updateCourse.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  // req.file is optional for update (can update other fields without changing PDF)
  const updated = await courseService.updateCourse(id, value, req.file);

  return res
    .status(200)
    .json(ApiResponse.success(updated, "Course updated successfully"));
});

export const deleteCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await courseService.deleteCourse(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Course deleted successfully"));
});

export default {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
};


