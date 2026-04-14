import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import blogRequestService from "../services/blogRequest.service.js";
import blogRequestValidator from "../validation/blogRequest.validator.js";

function normalizeBlogRequestBody(body) {
  const b = { ...body };
  if (typeof b.keyTakeaways === "string") {
    try {
      b.keyTakeaways = JSON.parse(b.keyTakeaways);
    } catch {
      b.keyTakeaways = b.keyTakeaways
        ? b.keyTakeaways.split(",").map((s) => s.trim())
        : [];
    }
  }
  return b;
}

/**
 * Submit blog request (for users - with optional image)
 * POST /user/blog-request
 */
export const submitBlogRequest = asyncHandler(async (req, res) => {
  console.log("Received blog request with body:",req.user)
  const body = normalizeBlogRequestBody(req.body);
  const { error, value } =
    blogRequestValidator.submitBlogRequest.validate(body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const payload = {
    ...value,
    name: req.user.name,
    email: req.user.email || req.user.phone,
    requestedBy: req.user._id,
  };

  const blogRequest = await blogRequestService.submitBlogRequest(
    payload,
    req.file,
  );

  return res
    .status(201)
    .json(
      ApiResponse.success(blogRequest, "Blog request submitted successfully"),
    );
});

/**
 * Get all blog requests (admin)
 * GET /admin/blog-request
 * GET /admin/blog-request?status=pending&page=1&limit=10&search=test
 */
export const getAllBlogRequests = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search;

  const filters = {};
  if (status) {
    filters.status = status;
  }
  if (search) {
    filters.search = search;
  }

  const { blogRequests, total } = await blogRequestService.getAllBlogRequests(
    filters,
    page,
    limit,
  );

  return res.status(200).json(
    ApiResponse.success(
      blogRequests,

      "Blog requests fetched successfully",
      {
        totalResults: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit: limit,
      },
    ),
  );
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
    .json(
      ApiResponse.success(blogRequest, "Blog request fetched successfully"),
    );
});

/**
 * Update blog request status (admin)
 * PATCH /admin/blog-request/:id
 */
export const updateBlogRequestStatus = asyncHandler(async (req, res) => {
  const { error, value } =
    blogRequestValidator.updateBlogRequestStatus.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const { id } = req.params;
  const { status } = value;

  const result = await blogRequestService.updateBlogRequestStatus(id, status);

  if (result?.deleted) {
    return res
      .status(200)
      .json(ApiResponse.success(null, "Blog request rejected and removed"));
  }

  return res
    .status(200)
    .json(ApiResponse.success(result, "Blog request approved successfully"));
});

export default {
  submitBlogRequest,
  getAllBlogRequests,
  getBlogRequestById,
  updateBlogRequestStatus,
};
