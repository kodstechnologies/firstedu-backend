import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Teacher from "../models/Teacher.js";
import * as teacherWithdrawalService from "../services/teacherWithdrawal.service.js";
import * as teacherWalletLedger from "../services/teacherWalletLedger.service.js";
import teacherWithdrawalValidator from "../validation/teacherWithdrawal.validator.js";

async function ensureTeacher(req) {
  const teacher = await Teacher.findById(req.user._id).select("_id");
  if (!teacher) {
    throw new ApiError(403, "Teacher access only");
  }
}

/**
 * GET /teacher/wallet
 */
export const getTeacherWallet = asyncHandler(async (req, res) => {
  await ensureTeacher(req);
  const overview = await teacherWithdrawalService.getTeacherWalletOverview(req.user._id);
  return res
    .status(200)
    .json(ApiResponse.success(overview, "Wallet fetched successfully"));
});

/**
 * PUT /teacher/wallet/bank-details
 */
export const putTeacherBankDetails = asyncHandler(async (req, res) => {
  await ensureTeacher(req);
  const { error, value } = teacherWithdrawalValidator.bankDetails.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    throw new ApiError(
      400,
      "Validation error",
      error.details.map((d) => d.message)
    );
  }
  const updated = await teacherWithdrawalService.updateTeacherBankDetails(req.user._id, value);
  return res
    .status(200)
    .json(ApiResponse.success(updated, "Bank details saved successfully"));
});

/**
 * GET /teacher/wallet/bank-details
 */
export const getTeacherBankDetails = asyncHandler(async (req, res) => {
  await ensureTeacher(req);
  const data = await teacherWithdrawalService.getTeacherBankDetailsMasked(req.user._id);
  return res
    .status(200)
    .json(ApiResponse.success(data, "Bank details fetched successfully"));
});

/**
 * POST /teacher/wallet/withdrawals
 */
/**
 * GET /teacher/wallet/transactions
 */
export const getTeacherWalletTransactions = asyncHandler(async (req, res) => {
  await ensureTeacher(req);
  const result = await teacherWalletLedger.getTeacherTransactionHistory(req.user._id, {
    page: req.query.page,
    limit: req.query.limit,
  });
  return res
    .status(200)
    .json(ApiResponse.success(result, "Transaction history fetched successfully"));
});

export const postTeacherWithdrawal = asyncHandler(async (req, res) => {
  await ensureTeacher(req);
  const { error, value } = teacherWithdrawalValidator.withdrawalAmount.validate(req.body, {
    abortEarly: false,
  });
  if (error) {
    throw new ApiError(
      400,
      "Validation error",
      error.details.map((d) => d.message)
    );
  }
  const request = await teacherWithdrawalService.createWithdrawalRequest(
    req.user._id,
    value.amount
  );
  return res.status(201).json(
    ApiResponse.success(
      {
        id: request._id,
        amount: request.amount,
        createdAt: request.createdAt,
      },
      "Withdrawal request submitted. An admin will review it shortly."
    )
  );
});

/**
 * GET /admin/teacher-withdrawals
 */
export const getAdminWithdrawalList = asyncHandler(async (req, res) => {
  const page = req.query.page;
  const limit = req.query.limit;
  const result = await teacherWithdrawalService.listPendingWithdrawalsForAdmin({ page, limit });
  return res
    .status(200)
    .json(ApiResponse.success(result, "Withdrawal requests fetched successfully"));
});

/**
 * GET /admin/teacher-withdrawals/:id
 */
export const getAdminWithdrawalById = asyncHandler(async (req, res) => {
  const request = await teacherWithdrawalService.getWithdrawalRequestForAdmin(req.params.id);
  return res
    .status(200)
    .json(ApiResponse.success(request, "Withdrawal request fetched successfully"));
});

/**
 * POST /admin/teacher-withdrawals/:id/approve
 */
export const postAdminApproveWithdrawal = asyncHandler(async (req, res) => {
  const result = await teacherWithdrawalService.approveWithdrawalRequest(
    req.user._id,
    req.params.id
  );
  return res
    .status(200)
    .json(ApiResponse.success(result, "Withdrawal approved and teacher notified"));
});

/**
 * POST /admin/teacher-withdrawals/:id/reject
 */
export const postAdminRejectWithdrawal = asyncHandler(async (req, res) => {
  const result = await teacherWithdrawalService.rejectWithdrawalRequest(
    req.user._id,
    req.params.id
  );
  return res
    .status(200)
    .json(ApiResponse.success(result, "Withdrawal rejected, wallet refunded, teacher notified"));
});
