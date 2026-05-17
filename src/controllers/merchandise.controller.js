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
  const { page = 1, limit = 10 } = req.query;
  const studentId = req.user._id;

  const result = await merchandiseService.getMerchandiseItems(page, limit);

  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  const meta = {
    ...result.pagination,
    totalPoints: wallet.rewardPoints ?? 0,
    monetaryBalance: wallet.monetaryBalance ?? 0,
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
  const plainItem = item?.toObject ? item.toObject() : { ...item };
  const data = {
    ...plainItem,
    totalPoints: wallet.rewardPoints ?? 0,
    monetaryBalance: wallet.monetaryBalance ?? 0,
  };

  return res
    .status(200)
    .json(ApiResponse.success(data, "Merchandise item fetched successfully"));
});

/**
 * Claim / purchase merchandise — unified endpoint.
 *
 * Supports paymentMethod: "points" (default) | "wallet" | "gateway"
 *
 * Mobile app backward compatibility:
 *   Omitting paymentMethod defaults to "points" — existing app behaviour
 *   is completely unchanged.
 *
 * Gateway two-step:
 *   Call 1 (no razorpayPaymentId) → returns { requiresAction:true, orderId, key, amount }
 *   Call 2 (with razorpay* fields) → creates claim, returns claim object
 */
export const claimMerchandise = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user._id;

  // Fetch item first so validator knows if it's physical
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

  const result = await merchandiseService.claimMerchandise(studentId, id, value);

  // Gateway Step 1: Razorpay order created, frontend must open checkout
  if (result?.requiresAction) {
    return res
      .status(200)
      .json(ApiResponse.success(result, "Payment initiation successful"));
  }

  // Points / Wallet / Gateway Step 2: claim created
  return res
    .status(201)
    .json(ApiResponse.success(result, "Merchandise claimed successfully"));
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
