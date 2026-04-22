import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import upgradeService from "../services/upgrade.service.js";

/**
 * GET /categories/:categoryId/upgrade-cost
 * Returns upgrade cost and new-content metadata for the frontend to decide
 * whether to show an upgrade prompt and at what price.
 */
export const getUpgradeCost = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const result = await upgradeService.calculateUpgradeCost(req.user._id, categoryId);
  return res.status(200).json(ApiResponse.success(result, "Upgrade cost fetched"));
});

/**
 * POST /categories/:categoryId/checkout-upgrade
 * Initiates an upgrade. For free/wallet → completes immediately.
 * For razorpay → returns Razorpay order details; client must call confirm-upgrade.
 *
 * Body: { paymentMethod: "free" | "wallet" | "razorpay" }
 */
export const processUpgrade = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { paymentMethod } = req.body;

  if (!paymentMethod) {
    throw new ApiError(400, "paymentMethod is required (free | wallet | razorpay).");
  }

  const result = await upgradeService.processUpgrade(req.user._id, categoryId, paymentMethod);
  return res.status(200).json(ApiResponse.success(result, "Upgrade processed"));
});

/**
 * POST /categories/:categoryId/confirm-upgrade
 * Confirms a Razorpay upgrade payment.
 *
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
export const confirmUpgrade = asyncHandler(async (req, res) => {
  const result = await upgradeService.confirmUpgrade(req.user._id, req.body);
  return res.status(200).json(ApiResponse.success(result, "Upgrade confirmed"));
});
