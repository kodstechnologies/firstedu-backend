import CategoryPurchase from "../models/CategoryPurchase.js";
import { ApiError } from "../utils/ApiError.js";

const findByStudentAndCategory = async (studentId, categoryId, paymentStatus = "completed") => {
  try {
    return await CategoryPurchase.findOne({
      student: studentId,
      categoryId,
      paymentStatus,
    });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch category purchase", error.message);
  }
};

const checkAccess = async (studentId, categoryId) => {
  try {
    // Check if the exact category or any of its cascades grant access
    return await CategoryPurchase.findOne({
      student: studentId,
      paymentStatus: "completed",
      $or: [
        { categoryId: categoryId },
        { unlockedCategoryIds: categoryId }
      ]
    });
  } catch (error) {
    throw new ApiError(500, "Failed to verify category access", error.message);
  }
};

const createPurchase = async (purchaseData) => {
  try {
    return await CategoryPurchase.create(purchaseData);
  } catch (error) {
    throw new ApiError(500, "Failed to create category purchase", error.message);
  }
};

const updatePurchaseStatus = async (purchaseId, status, paymentId = null) => {
  try {
    const updateData = { paymentStatus: status };
    if (paymentId) updateData.paymentId = paymentId;
    
    return await CategoryPurchase.findByIdAndUpdate(
      purchaseId,
      updateData,
      { new: true }
    );
  } catch (error) {
    throw new ApiError(500, "Failed to update category purchase status", error.message);
  }
};

const findByStudent = async (studentId, pillarType = null) => {
  try {
    const query = { student: studentId, paymentStatus: "completed" };
    if (pillarType) query.pillarType = pillarType;
    
    return await CategoryPurchase.find(query)
      .populate("categoryId", "name rootType price description")
      .populate("unlockedCategoryIds", "name rootType")
      .sort({ createdAt: -1 });
  } catch (error) {
    throw new ApiError(500, "Failed to fetch student category purchases", error.message);
  }
};

/**
 * Acknowledge an upgrade: $addToSet new IDs, updates lastUpgradedAt,
 * and increments purchasePrice by paidAmount (so the next upgrade
 * cost calculation uses the correct baseline and never charges twice).
 *
 * @param {string|ObjectId} purchaseId
 * @param {string[]} newIds  - new descendant category IDs to unlock
 * @param {number}   paidAmount - amount the student paid for this upgrade (0 for free upgrades)
 */
const acknowledgeUpgrade = async (purchaseId, newIds = [], paidAmount = 0) => {
  try {
    const update = { $set: { lastUpgradedAt: new Date() } };
    if (newIds && newIds.length > 0) {
      update.$addToSet = { unlockedCategoryIds: { $each: newIds } };
    }
    if (paidAmount > 0) {
      update.$inc = { purchasePrice: paidAmount };
    }
    return await CategoryPurchase.findByIdAndUpdate(purchaseId, update, { new: true });
  } catch (error) {
    throw new ApiError(500, "Failed to apply upgrade", error.message);
  }
};

export default {
  findByStudentAndCategory,
  checkAccess,
  createPurchase,
  updatePurchaseStatus,
  acknowledgeUpgrade,
  findByStudent,
};
