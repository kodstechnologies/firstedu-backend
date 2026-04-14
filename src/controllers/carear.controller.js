import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import carearService from "../services/carear.service.js";
import carearValidator from "../validation/carear.validator.js";

/**
 * Create a new carear job
 * POST /admin/carears
 */
export const createCarearJob = asyncHandler(async (req, res) => {
  const { error, value } = carearValidator.createCarearJob.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const job = await carearService.createJob(value);
  return res
    .status(201)
    .json(ApiResponse.success(job, "Carear job created successfully"));
});

/**
 * Get all carear jobs with filtering and pagination
 * GET /admin/carears
 */
export const getCarearJobs = asyncHandler(async (req, res) => {
  const {
    search,
    category,
    type,
    mode,
    location,
    company,
    page: queryPage,
    limit: queryLimit,
  } = req.query;

  const page = parseInt(queryPage) || 1;
  const limit = parseInt(queryLimit) || 10;

  const filters = {
    search,
    category,
    type,
    mode,
    location,
    company,
  };

  const { jobs, total } = await carearService.getAllJobs(filters, page, limit);

  return res.status(200).json(
    ApiResponse.success(jobs, "Carear jobs fetched successfully", {
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit: limit,
    }),
  );
});

/**
 * Get a specific carear job by ID
 * GET /admin/carears/:id
 */
export const getCarearJobById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const job = await carearService.getJobById(id);

  return res
    .status(200)
    .json(ApiResponse.success(job, "Carear job fetched successfully"));
});

/**
 * Update a specific carear job
 * PUT /admin/carears/:id
 */
export const updateCarearJob = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { error, value } = carearValidator.updateCarearJob.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const job = await carearService.updateJob(id, value);

  return res
    .status(200)
    .json(ApiResponse.success(job, "Carear job updated successfully"));
});

/**
 * Delete a carear job
 * DELETE /admin/carears/:id
 */
export const deleteCarearJob = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await carearService.deleteJob(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, "Carear job deleted successfully"));
});

export default {
  createCarearJob,
  getCarearJobs,
  getCarearJobById,
  updateCarearJob,
  deleteCarearJob,
};
