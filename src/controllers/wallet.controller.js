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
 * Recharge wallet (structure for payment gateway integration)
 */
export const rechargeWallet = asyncHandler(async (req, res) => {
  const { error, value } = walletValidator.rechargeWallet.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const userId = req.user._id;
  const userType = req.user.userType || "User";
  const { amount, paymentId } = value;

  // TODO: Integrate payment gateway here
  // For now, we'll just add the balance directly
  // In production, this should:
  // 1. Create a payment intent with payment gateway
  // 2. Verify payment status
  // 3. Then add balance

  const wallet = await walletService.addMonetaryBalance(
    userId,
    amount,
    paymentId || `RECHARGE_${Date.now()}`,
    userType
  );

  return res
    .status(200)
    .json(
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
  rechargeWallet,
  getPointsHistory,
};

