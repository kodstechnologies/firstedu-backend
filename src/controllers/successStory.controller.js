import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import successStoryService from "../services/successStory.service.js";
import successStoryValidator from "../validation/successStory.validator.js";

// ==================== ADMIN CONTROLLERS ====================

/**
 * Add success story (Admin)
 * POST /admin/success-stories
 */
export const addSuccessStory = asyncHandler(async (req, res) => {
    const { error, value } = successStoryValidator.createSuccessStory.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const adminId = req.user._id;
    const files = req.files;

    const story = await successStoryService.createSuccessStory(value, files, adminId);

    return res
        .status(201)
        .json(ApiResponse.success(story, "Success story created successfully"));
});

/**
 * Get all success stories (Admin)
 * GET /admin/success-stories
 * GET /admin/success-stories?status=PUBLISHED
 */
export const getAllStoriesAdmin = asyncHandler(async (req, res) => {
    const { status, page, limit, search } = req.query;

    const filters = {};
    if (status) {
        filters.status = status;
    }

    const result = await successStoryService.getAllStories(filters, {
        page,
        limit,
        search,
    });

    return res
        .status(200)
        .json(
            ApiResponse.success(
                result.list,
                "Success stories fetched successfully",
                result.pagination
            )
        );
});

/**
 * Get success story by ID (Admin)
 * GET /admin/success-stories/:id
 */
export const getStoryByIdAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const story = await successStoryService.getStoryById(id);

    return res
        .status(200)
        .json(ApiResponse.success(story, "Success story fetched successfully"));
});

/**
 * Update success story (Admin)
 * PUT /admin/success-stories/:id
 */
export const updateSuccessStory = asyncHandler(async (req, res) => {
    const { error, value } = successStoryValidator.updateSuccessStory.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const { id } = req.params;
    const files = req.files;
    const hasFiles = files?.media?.[0] || files?.thumbnail?.[0];
    if (Object.keys(value).length === 0 && !hasFiles) {
        throw new ApiError(400, "At least one field (name, description, achievement, achieveIn) or file (media, thumbnail) is required");
    }

    const updatedStory = await successStoryService.updateSuccessStory(id, value, files);

    return res
        .status(200)
        .json(ApiResponse.success(updatedStory, "Success story updated successfully"));
});

/**
 * Update story status (Admin)
 * PATCH /admin/success-stories/:id/status
 */
export const updateStoryStatus = asyncHandler(async (req, res) => {
    const { error, value } = successStoryValidator.updateStatus.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const { id } = req.params;
    const { status } = value;

    const updatedStory = await successStoryService.updateStoryStatus(id, status);

    return res
        .status(200)
        .json(ApiResponse.success(updatedStory, "Story status updated successfully"));
});

/**
 * Delete success story (Admin)
 * DELETE /admin/success-stories/:id
 */
export const deleteSuccessStory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await successStoryService.deleteSuccessStory(id);

    return res
        .status(200)
        .json(ApiResponse.success(null, "Success story deleted successfully"));
});

// ==================== STUDENT CONTROLLERS ====================

/**
 * Get featured success stories (Student)
 * GET /success-stories/featured
 */
export const getFeaturedStories = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 3;

    const stories = await successStoryService.getFeaturedStories(limit);

    return res
        .status(200)
        .json(ApiResponse.success(stories, "Featured stories fetched successfully"));
});

/**
 * Get all published success stories (Student)
 * GET /success-stories
 */
export const getAllStoriesStudent = asyncHandler(async (req, res) => {
    const stories = await successStoryService.getAllPublishedStories({});

    return res
        .status(200)
        .json(ApiResponse.success(stories, "Success stories fetched successfully"));
});

/**
 * Get success story detail (Student)
 * GET /success-stories/:id
 */
export const getStoryDetailStudent = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const story = await successStoryService.getPublishedStoryById(id);

    return res
        .status(200)
        .json(ApiResponse.success(story, "Success story fetched successfully"));
});

export default {
    // Admin
    addSuccessStory,
    getAllStoriesAdmin,
    getStoryByIdAdmin,
    updateSuccessStory,
    updateStoryStatus,
    deleteSuccessStory,
    // Student
    getFeaturedStories,
    getAllStoriesStudent,
    getStoryDetailStudent,
};
