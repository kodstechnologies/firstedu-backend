import Wallet from "../models/Wallet.js";
import PointsTransaction from "../models/PointsTransaction.js";
import { ApiError } from "../utils/ApiError.js";

const findWallet = async (userId, userType = "User") => {
  try {
    return await Wallet.findOne({ user: userId, userType });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch wallet", error.message);
  }
};

const createWallet = async (walletData) => {
  try {
    return await Wallet.create(walletData);
  } catch (error) {
    throw new ApiError(500, "Failed to create wallet", error.message);
  }
};

const updateWallet = async (walletId, updateData) => {
  try {
    return await Wallet.findByIdAndUpdate(walletId, updateData, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to update wallet", error.message);
  }
};

const createPointsTransaction = async (transactionData) => {
  try {
    return await PointsTransaction.create(transactionData);
  } catch (error) {
    throw new ApiError(500, "Failed to create points transaction", error.message);
  }
};

const findPointsTransactions = async (studentId, options = {}) => {
  try {
    const { page = 1, limit = 10 } = options;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      PointsTransaction.find({ student: studentId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      PointsTransaction.countDocuments({ student: studentId }),
    ]);

    return {
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    };
  } catch (error) {
    throw new ApiError(500, "Failed to fetch points transactions", error.message);
  }
};

export default {
  findWallet,
  createWallet,
  updateWallet,
  createPointsTransaction,
  findPointsTransactions,
};

