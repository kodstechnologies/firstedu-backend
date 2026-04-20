import { ApiError } from "../utils/ApiError.js";
import merchandiseRepository from "../repository/merchandise.repository.js";
import walletService from "./wallet.service.js";
import { attachOfferToList, attachOfferToItem, getAmountToCharge } from "../utils/offerUtils.js";
import couponService from "./coupon.service.js";

/**
 * Get all merchandise items (admin - includes inactive)
 */
export const getAllMerchandiseForAdmin = async (page = 1, limit = 10,  isActive = null, search = null) => {
  const query = {};
  if (isActive !== null) query.isActive = isActive === "true";
  if (search && search.trim()) {
    const regex = { $regex: search.trim(), $options: "i" };
    query.$or = [{ name: regex }, { description: regex }];
  }

  const result = await merchandiseRepository.findMerchandise(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });

  return {
    items: result.items,
    pagination: result.pagination,
  };
};

/**
 * Get merchandise by ID (admin - no isActive check)
 */
export const getMerchandiseByIdForAdmin = async (itemId) => {
  const item = await merchandiseRepository.findMerchandiseById(itemId);
  if (!item) {
    throw new ApiError(404, "Merchandise not found");
  }
  return item;
};

/**
 * Get all active merchandise items
 */
export const getMerchandiseItems = async (page = 1, limit = 10) => {
  const query = { isActive: true };

  const result = await merchandiseRepository.findMerchandise(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });

  const itemsWithOffer = await attachOfferToList(result.items, "Ecommerce", "pointsRequired");
  return {
    items: itemsWithOffer,
    pagination: result.pagination,
  };
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

  return await attachOfferToItem(item, "Ecommerce", "pointsRequired");
};

/**
 * Claim merchandise item
 * @param {string} studentId
 * @param {string} itemId
 * @param {object} deliveryAddress - Required for physical items
 * @param {string} [couponCode] - Optional coupon for points discount
 */
export const claimMerchandise = async (studentId, itemId, deliveryAddress, couponCode = null) => {
  const item = await getMerchandiseById(itemId);

  const basePoints = item.discountedPrice != null ? item.discountedPrice : item.pointsRequired;
  const { amountToCharge: pointsRequired, couponId } = await getAmountToCharge(
    "Ecommerce",
    basePoints,
    couponCode
  );

  // Check if student has enough points
  const wallet = await walletService.getOrCreateWallet(studentId, "User");
  if (wallet.rewardPoints < pointsRequired) {
    throw new ApiError(400, "Insufficient reward points");
  }

  // Check stock if inventory tracking is enabled
  if (item.stockQuantity !== null && item.stockQuantity <= 0) {
    throw new ApiError(400, "Item is out of stock");
  }

  // Deduct points (use coupon/offer discounted amount)
  await walletService.deductRewardPoints(
    studentId,
    pointsRequired,
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
    pointsSpent: pointsRequired,
    status: "pending",
    deliveryAddress: item.isPhysical ? deliveryAddress : undefined,
  });

  // Update stock if inventory tracking is enabled
  if (item.stockQuantity !== null) {
    await merchandiseRepository.updateMerchandise(itemId, {
      stockQuantity: item.stockQuantity - 1,
    });
  }

  // Increment coupon usedCount only after successful claim
  if (couponId) {
    await couponService.incrementCouponUsedCount(couponId);
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
export const getAllClaims = async (page = 1, limit = 10, status = null, search = null) => {
  const query = {};
  if (status) {
    query.status = status;
  }
  if (search && String(search).trim()) {
    const regex = { $regex: String(search).trim(), $options: "i" };
    query.$or = [{ trackingNumber: regex }];
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
  getAllMerchandiseForAdmin,
  getMerchandiseByIdForAdmin,
  claimMerchandise,
  getStudentClaims,
  getAllClaims,
};

