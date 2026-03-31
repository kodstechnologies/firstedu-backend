import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import blogService from "../services/blog.service.js";
import blogValidator from "../validation/blog.validator.js";

function normalizeBody(body) {
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
 * Create blog (admin only - admin-added blog)
 * POST /admin/blogs
 */
export const createBlog = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = blogValidator.createBlog.validate(body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }
  const blog = await blogService.createBlog(value, req.user._id, req.file);
  return res
    .status(201)
    .json(ApiResponse.success(blog, "Blog created successfully"));
});

/**
 * Get all approved blogs (students/users - approved requests + admin-added)
 * GET /blogs?page=1&limit=10&search=test&subject=Math
 */
export const getAllBlogs = asyncHandler(async (req, res) => {
  const subject = req.query.subject;
  const source = req.query.source;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search;

  const filters = {};
  if (subject) filters.subject = subject;
  if (source) filters.source = source;
  if (search) filters.search = search;

  const { blogs, total } = await blogService.getAllBlogs(filters, page, limit);

  return res.status(200).json(
    ApiResponse.success(
      blogs,
     
      "Blogs fetched successfully",
       {
        totalResults: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit: limit,
      }
     
    ),
  );
});

/**
 * Get blog by ID
 * GET /user/blogs/:id · GET /admin/blogs/:id
 */
export const getBlogById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const blog = await blogService.getBlogById(id);
  return res
    .status(200)
    .json(ApiResponse.success(blog, "Blog fetched successfully"));
});

/**
 * Update blog (admin - admin-created or approved blog)
 * PUT /admin/blogs/:id
 */
export const updateBlog = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = blogValidator.updateBlog.validate(body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }
  if (Object.keys(value).length === 0 && !req.file) {
    throw new ApiError(
      400,
      "At least one field (title, description, subject, keyTakeaways) or image is required",
    );
  }
  const { id } = req.params;
  const blog = await blogService.updateBlog(id, value, req.file);
  return res
    .status(200)
    .json(ApiResponse.success(blog, "Blog updated successfully"));
});

/**
 * Delete blog (admin - admin-created or approved blog)
 * DELETE /admin/blogs/:id
 */
export const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await blogService.deleteBlog(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Blog deleted successfully"));
});

export default {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
};
