import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import merchandiseService from "../services/merchandise.service.js";
import merchandiseValidator from "../validation/merchandise.validator.js";
import walletService from "../services/wallet.service.js";

/**
 * Get all merchandise items
 */
export const getMerchandiseItems = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, category } = req.query;
  const studentId = req.user._id;

  const result = await merchandiseService.getMerchandiseItems(page, limit, category);

  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  const meta = {
    ...result.pagination,
    totalPoints: wallet.rewardPoints ?? 0,
  };

  return res.status(200).json(
    ApiResponse.success(
      result.items,
      "Merchandise items fetched successfully",
      meta
    )
  );
});

/**
 * Get merchandise item by ID
 */
export const getMerchandiseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  const item = await merchandiseService.getMerchandiseById(id);

  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  const totalPoints = wallet.rewardPoints ?? 0;
  const plainItem = item?.toObject ? item.toObject() : { ...item };
  const data = { ...plainItem, totalPoints };

  return res
    .status(200)
    .json(ApiResponse.success(data, "Merchandise item fetched successfully"));
});

/**
 * Claim merchandise item
 */
export const claimMerchandise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;
  
  // Get merchandise to check if physical
  const item = await merchandiseService.getMerchandiseById(id);
  
  const { error, value } = merchandiseValidator.claimMerchandise.validate(
    req.body,
    { context: { isPhysical: item.isPhysical } }
  );

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const claim = await merchandiseService.claimMerchandise(
    studentId,
    id,
    value.deliveryAddress
  );

  return res
    .status(201)
    .json(ApiResponse.success(claim, "Merchandise claimed successfully"));
});

/**
 * Get student's merchandise claims
 */
export const getMyClaims = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const result = await merchandiseService.getStudentClaims(studentId, page, limit);

  return res.status(200).json(
    ApiResponse.success(
      result.claims,
      "Merchandise claims fetched successfully",
      result.pagination
    )
  );
});

export default {
  getMerchandiseItems,
  getMerchandiseById,
  claimMerchandise,
  getMyClaims,
};

