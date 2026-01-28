import { ApiError } from "../utils/ApiError.js";
import merchandiseRepository from "../repository/merchandise.repository.js";
import walletService from "./wallet.service.js";

/**
 * Get all active merchandise items
 */
export const getMerchandiseItems = async (page = 1, limit = 10, category = null) => {
  const query = { isActive: true };
  if (category) {
    query.category = category;
  }

  return await merchandiseRepository.findMerchandise(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });
};

/**
 * Get merchandise item by ID
 */
export const getMerchandiseById = async (itemId) => {
  const item = await merchandiseRepository.findMerchandiseById(itemId);

  if (!item) {
    throw new ApiError(404, "Merchandise item not found");
  }

  if (!item.isActive) {
    throw new ApiError(404, "Merchandise item not available");
  }

  return item;
};

/**
 * Claim merchandise item
 */
export const claimMerchandise = async (studentId, itemId, deliveryAddress) => {
  const item = await getMerchandiseById(itemId);

  // Check if student has enough points
  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  if (wallet.rewardPoints < item.pointsRequired) {
    throw new ApiError(400, "Insufficient reward points");
  }

  // Check stock if inventory tracking is enabled
  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  // Deduct points
  await walletService.deductRewardPoints(
    studentId,
    item.pointsRequired,
    "merchandise_redemption",
    `Redeemed points for: ${item.name}`,
    itemId,
    "MerchandiseClaim"
  );

  // If physical item, require delivery address
  if (item.isPhysical && !deliveryAddress) {
    throw new ApiError(400, "Delivery address is required for physical items");
  }

  // Create claim
  const claim = await merchandiseRepository.createMerchandiseClaim({
    student: studentId,
    merchandise: itemId,
    pointsSpent: item.pointsRequired,
    status: "pending",
    deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
  });

  // Update stock if inventory tracking is enabled
  if (item.stockQuantity !== null) {
    await merchandiseRepository.updateMerchandise(itemId, {
      stockQuantity: item.stockQuantity - 1,
    });
  }

  return await merchandiseRepository.findMerchandiseClaimById(claim._id);
};

/**
 * Get student's merchandise claims
 */
export const getStudentClaims = async (studentId, page = 1, limit = 10) => {
  return await merchandiseRepository.findMerchandiseClaims(
    { student: studentId },
    { page, limit, sort: { claimedAt: -1 } }
  );
};

/**
 * Get all merchandise claims (for admin)
 */
export const getAllClaims = async (page = 1, limit = 10, status = null) => {
  const query = {};
  if (status) {
    query.status = status;
  }

  return await merchandiseRepository.findMerchandiseClaims(query, {
    page,
    limit,
    sort: { claimedAt: -1 },
  });
};

export default {
  getMerchandiseItems,
  getMerchandiseById,
  claimMerchandise,
  getStudentClaims,
  getAllClaims,
};

