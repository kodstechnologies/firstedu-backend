import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import blogRequestService from "../services/blogRequest.service.js";
import blogRequestValidator from "../validation/blogRequest.validator.js";

/**
 * Submit blog request (for students and teachers)
 * POST /api/blog-request
 */
export const submitBlogRequest = asyncHandler(async (req, res) => {
    const { error, value } = blogRequestValidator.submitBlogRequest.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const blogRequest = await blogRequestService.submitBlogRequest(value);

    return res
        .status(201)
        .json(ApiResponse.success(blogRequest, "Blog request submitted successfully"));
});

/**
 * Get all blog requests (admin)
 * GET /admin/blog-request
 * GET /admin/blog-request?status=pending
 */
export const getAllBlogRequests = asyncHandler(async (req, res) => {
    const { status } = req.query;

    const filters = {};
    if (status) {
        filters.status = status;
    }

    const blogRequests = await blogRequestService.getAllBlogRequests(filters);

    return res
        .status(200)
        .json(ApiResponse.success(blogRequests, "Blog requests fetched successfully"));
});

/**
 * Get blog request by ID (admin)
 * GET /admin/blog-request/:id
 */
export const getBlogRequestById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const blogRequest = await blogRequestService.getBlogRequestById(id);

    return res
        .status(200)
        .json(ApiResponse.success(blogRequest, "Blog request fetched successfully"));
});

/**
 * Update blog request status (admin)
 * PATCH /admin/blog-request/:id
 */
export const updateBlogRequestStatus = asyncHandler(async (req, res) => {
    const { error, value } = blogRequestValidator.updateBlogRequestStatus.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const { id } = req.params;
    const { status, adminComment } = value;

    const updatedBlogRequest = await blogRequestService.updateBlogRequestStatus(
        id,
        status,
        adminComment
    );

    return res
        .status(200)
        .json(ApiResponse.success(updatedBlogRequest, "Blog request updated successfully"));
});

export default {
    submitBlogRequest,
    getAllBlogRequests,
    getBlogRequestById,
    updateBlogRequestStatus,
};
