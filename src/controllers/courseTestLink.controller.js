import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import courseTestLinkValidator from "../validation/courseTestLink.validator.js";

// Link Test to Course (Follow-up Test)
export const createCourseTestLink = asyncHandler(async (req, res) => {
  const { error, value } = courseTestLinkValidator.createCourseTestLink.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { course, test, order, isRequired } = value;

  // Verify course exists
  const courseExists = await courseTestLinkRepository.findCourseById(course);
  if (!courseExists) {
    throw new ApiError(404, "Course not found");
  }

  // Verify test exists
  const testExists = await courseTestLinkRepository.findTestById(test);
  if (!testExists) {
    throw new ApiError(404, "Test not found");
  }

  // Check if link already exists
  const existingLink = await courseTestLinkRepository.findOne({ course, test });
  if (existingLink) {
    throw new ApiError(400, "Test is already linked to this course");
  }

  const link = await courseTestLinkRepository.create({
    course,
    test,
    order: order || 0,
    isRequired: isRequired !== undefined ? isRequired : true,
    createdBy: req.user._id,
  });

  return res
    .status(201)
    .json(
      ApiResponse.success(
        link,
        "Test linked to course successfully"
      )
    );
});

// Get All Links for a Course
export const getCourseTestLinks = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const links = await courseTestLinkRepository.findAll(
    { course: courseId },
    { sortBy: "order", sortOrder: "asc" }
  );

  return res
    .status(200)
    .json(
      ApiResponse.success(
        links,
        "Course test links fetched successfully"
      )
    );
});

// Update Link Order/Required Status
export const updateCourseTestLink = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = courseTestLinkValidator.updateCourseTestLink.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const updateData = {};
  if (value.order !== undefined) updateData.order = value.order;
  if (value.isRequired !== undefined) updateData.isRequired = value.isRequired;

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const link = await courseTestLinkRepository.updateById(id, updateData);

  if (!link) {
    throw new ApiError(404, "Link not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(link, "Link updated successfully"));
});

// Remove Link
export const deleteCourseTestLink = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await courseTestLinkRepository.deleteById(id);

  if (!deleted) {
    throw new ApiError(404, "Link not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(null, "Link removed successfully"));
});

export default {
  createCourseTestLink,
  getCourseTestLinks,
  updateCourseTestLink,
  deleteCourseTestLink,
};

