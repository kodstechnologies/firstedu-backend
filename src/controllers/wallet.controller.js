import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import walletService from "../services/wallet.service.js";
import walletValidator from "../validation/wallet.validator.js";

/**
 * Get wallet balance
 */
export const getWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userType = req.user.userType || "User";

  const balance = await walletService.getWalletBalance(userId, userType);

  return res
    .status(200)
    .json(ApiResponse.success(balance, "Wallet balance fetched successfully"));
});

/**
 * Initiate wallet recharge – create Razorpay order for checkout
 */
export const initiateRecharge = asyncHandler(async (req, res) => {
  const { error, value } = walletValidator.initiateRecharge.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const userId = req.user._id;
  const { amount } = value;

  const result = await walletService.initiateWalletRecharge(userId, amount);

  return res.status(200).json(
    ApiResponse.success(result, "Razorpay order created. Complete payment to recharge.")
  );
});

/**
 * Complete wallet recharge – verify Razorpay payment and add balance
 */
export const completeRecharge = asyncHandler(async (req, res) => {
  const { error, value } = walletValidator.completeRecharge.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const userId = req.user._id;
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = value;

  const wallet = await walletService.completeWalletRecharge(
    userId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );

  return res.status(200).json(
    ApiResponse.success(
      { balance: wallet.monetaryBalance },
      "Wallet recharged successfully"
    )
  );
});

/**
 * Get points transaction history
 */
export const getPointsHistory = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const result = await walletService.getPointsHistory(studentId, page, limit);

  return res.status(200).json(
    ApiResponse.success(
      result.transactions,
      "Points history fetched successfully",
      result.pagination
    )
  );
});

export default {
  getWallet,
  initiateRecharge,
  completeRecharge,
  getPointsHistory,
};

