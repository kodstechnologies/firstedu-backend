import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import merchandiseService from "../services/merchandise.service.js";
import merchandiseRepository from "../repository/merchandise.repository.js";
import merchandiseValidator from "../validation/merchandise.validator.js";

/**
 * Create merchandise item (admin)
 */
export const createMerchandise = asyncHandler(async (req, res) => {
  const { error, value } = merchandiseValidator.createMerchandise.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const merchandise = await merchandiseRepository.createMerchandise(value);

  return res
    .status(201)
    .json(ApiResponse.success(merchandise, "Merchandise created successfully"));
});

/**
 * Update merchandise item (admin)
 */
export const updateMerchandise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = merchandiseValidator.updateMerchandise.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const merchandise = await merchandiseRepository.updateMerchandise(id, value);

  if (!merchandise) {
    throw new ApiError(404, "Merchandise not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(merchandise, "Merchandise updated successfully"));
});

/**
 * Delete merchandise item (admin)
 */
export const deleteMerchandise = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const merchandise = await merchandiseRepository.deleteMerchandise(id);

  if (!merchandise) {
    throw new ApiError(404, "Merchandise not found");
  }

  return res
    .status(200)
    .json(ApiResponse.success(null, "Merchandise deleted successfully"));
});

/**
 * Get all merchandise claims (admin)
 */
export const getMerchandiseRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const result = await merchandiseService.getAllClaims(page, limit, status);

  return res.status(200).json(
    ApiResponse.success(
      result.claims,
      "Merchandise requests fetched successfully",
      result.pagination
    )
  );
});

/**
 * Update merchandise claim status (admin)
 */
export const updateClaimStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = merchandiseValidator.updateClaimStatus.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { status, trackingNumber } = value;

  const claim = await merchandiseRepository.findMerchandiseClaimById(id);

  if (!claim) {
    throw new ApiError(404, "Claim not found");
  }

  claim.status = status;
  if (trackingNumber) {
    claim.trackingNumber = trackingNumber;
  }

  if (status === "shipped" && !claim.shippedAt) {
    claim.shippedAt = new Date();
  }

  if (status === "delivered" && !claim.deliveredAt) {
    claim.deliveredAt = new Date();
  }

  const updateData = { status };
  if (trackingNumber) {
    updateData.trackingNumber = trackingNumber;
  }
  if (status === "shipped" && !claim.shippedAt) {
    updateData.shippedAt = new Date();
  }
  if (status === "delivered" && !claim.deliveredAt) {
    updateData.deliveredAt = new Date();
  }

  const updatedClaim = await merchandiseRepository.updateMerchandiseClaim(id, updateData);

  return res
    .status(200)
    .json(ApiResponse.success(updatedClaim, "Claim status updated successfully"));
});

export default {
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
  getMerchandiseRequests,
  updateClaimStatus,
};

