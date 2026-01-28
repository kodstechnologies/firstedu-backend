import { ApiError } from "../utils/ApiError.js";
import walletRepository from "../repository/wallet.repository.js";

/**
 * Get or create wallet for a user
 */
export const getOrCreateWallet = async (userId, userType = "User") => {
  let wallet = await walletRepository.findWallet(userId, userType);

  if (!wallet) {
    wallet = await walletRepository.createWallet({
      user: userId,
      userType,
      monetaryBalance: 0,
      rewardPoints: 0,
    });
  }

  return wallet;
};

/**
 * Get wallet balance
 */
export const getWalletBalance = async (userId, userType = "User") => {
  const wallet = await getOrCreateWallet(userId, userType);
  return {
    monetaryBalance: wallet.monetaryBalance,
    rewardPoints: wallet.rewardPoints,
  };
};

/**
 * Add monetary balance (for recharge)
 */
export const addMonetaryBalance = async (userId, amount, paymentId, userType = "User") => {
  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  const wallet = await getOrCreateWallet(userId, userType);
  const newBalance = wallet.monetaryBalance + amount;
  return await walletRepository.updateWallet(wallet._id, {
    monetaryBalance: newBalance,
  });
};

/**
 * Deduct monetary balance
 */
export const deductMonetaryBalance = async (userId, amount, userType = "User") => {
  const wallet = await getOrCreateWallet(userId, userType);

  if (wallet.monetaryBalance < amount) {
    throw new ApiError(400, "Insufficient balance");
  }

  const newBalance = wallet.monetaryBalance - amount;
  return await walletRepository.updateWallet(wallet._id, {
    monetaryBalance: newBalance,
  });
};

/**
 * Add reward points
 */
export const addRewardPoints = async (
  studentId,
  amount,
  source,
  description,
  referenceId = null,
  referenceType = null
) => {
  if (amount <= 0) {
    throw new ApiError(400, "Points amount must be greater than 0");
  }

  const wallet = await getOrCreateWallet(studentId, "User");
  const newPoints = wallet.rewardPoints + amount;
  const updatedWallet = await walletRepository.updateWallet(wallet._id, {
    rewardPoints: newPoints,
  });

  // Create transaction record
  await walletRepository.createPointsTransaction({
    student: studentId,
    type: "earned",
    amount,
    source,
    description,
    referenceId,
    referenceType,
    balanceAfter: updatedWallet.rewardPoints,
  });

  return updatedWallet;
};

/**
 * Deduct reward points
 */
export const deductRewardPoints = async (
  studentId,
  amount,
  source,
  description,
  referenceId = null,
  referenceType = null
) => {
  const wallet = await getOrCreateWallet(studentId, "User");

  if (wallet.rewardPoints < amount) {
    throw new ApiError(400, "Insufficient reward points");
  }

  const newPoints = wallet.rewardPoints - amount;
  const updatedWallet = await walletRepository.updateWallet(wallet._id, {
    rewardPoints: newPoints,
  });

  // Create transaction record
  await walletRepository.createPointsTransaction({
    student: studentId,
    type: "spent",
    amount,
    source,
    description,
    referenceId,
    referenceType,
    balanceAfter: updatedWallet.rewardPoints,
  });

  return updatedWallet;
};

/**
 * Get points transaction history
 */
export const getPointsHistory = async (studentId, page = 1, limit = 10) => {
  return await walletRepository.findPointsTransactions(studentId, { page, limit });
};

export default {
  getOrCreateWallet,
  getWalletBalance,
  addMonetaryBalance,
  deductMonetaryBalance,
  addRewardPoints,
  deductRewardPoints,
  getPointsHistory,
};

