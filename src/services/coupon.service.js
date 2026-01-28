import { ApiError } from "../utils/ApiError.js";
import couponRepository from "../repository/coupon.repository.js";

/**
 * Create a new coupon
 */
export const createCoupon = async (couponData) => {
  // Check if code already exists
  const existingCoupon = await couponRepository.findCouponByCode(couponData.code);
  if (existingCoupon) {
    throw new ApiError(400, "Coupon code already exists");
  }

  // Validate dates
  if (new Date(couponData.validUntil) <= new Date(couponData.validFrom)) {
    throw new ApiError(400, "Valid until date must be after valid from date");
  }

  // Validate discount value
  if (couponData.discountType === "percentage" && couponData.discountValue > 100) {
    throw new ApiError(400, "Percentage discount cannot exceed 100%");
  }

  return await couponRepository.createCoupon({
    ...couponData,
    code: couponData.code.toUpperCase(),
  });
};

/**
 * Get all coupons
 */
export const getCoupons = async (page = 1, limit = 10, isActive = null) => {
  const query = {};
  if (isActive !== null) {
    query.isActive = isActive === "true";
  }

  return await couponRepository.findCoupons(query, {
    page,
    limit,
    sort: { createdAt: -1 },
  });
};

/**
 * Get coupon by ID
 */
export const getCouponById = async (couponId) => {
  const coupon = await couponRepository.findCouponById(couponId);

  if (!coupon) {
    throw new ApiError(404, "Coupon not found");
  }

  return coupon;
};

/**
 * Update coupon
 */
export const updateCoupon = async (couponId, updateData) => {
  const coupon = await getCouponById(couponId);

  // If code is being updated, check for duplicates
  if (updateData.code && updateData.code.toUpperCase() !== coupon.code) {
    const existingCoupon = await couponRepository.findCouponByCode(updateData.code);
    if (existingCoupon && existingCoupon._id.toString() !== couponId) {
      throw new ApiError(400, "Coupon code already exists");
    }
    updateData.code = updateData.code.toUpperCase();
  }

  // Validate dates if provided
  if (updateData.validFrom || updateData.validUntil) {
    const validFrom = updateData.validFrom || coupon.validFrom;
    const validUntil = updateData.validUntil || coupon.validUntil;
    if (new Date(validUntil) <= new Date(validFrom)) {
      throw new ApiError(400, "Valid until date must be after valid from date");
    }
  }

  return await couponRepository.updateCoupon(couponId, updateData);
};

/**
 * Delete coupon
 */
export const deleteCoupon = async (couponId) => {
  await getCouponById(couponId); // Verify exists
  await couponRepository.deleteCoupon(couponId);
  return { message: "Coupon deleted successfully" };
};

/**
 * Validate and apply coupon
 */
export const validateCoupon = async (code, purchaseAmount, itemType = "all") => {
  const coupon = await couponRepository.findCouponByCode(code);

  if (!coupon) {
    throw new ApiError(404, "Invalid or inactive coupon code");
  }

  // Check validity dates
  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validUntil) {
    throw new ApiError(400, "Coupon is not valid at this time");
  }

  // Check usage limit
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new ApiError(400, "Coupon usage limit exceeded");
  }

  // Check minimum purchase amount
  if (purchaseAmount < coupon.minPurchaseAmount) {
    throw new ApiError(
      400,
      `Minimum purchase amount of ${coupon.minPurchaseAmount} required`
    );
  }

  // Check applicable to
  if (coupon.applicableTo !== "all" && coupon.applicableTo !== itemType) {
    throw new ApiError(400, `Coupon is not applicable to ${itemType}`);
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (purchaseAmount * coupon.discountValue) / 100;
    if (coupon.maxDiscountAmount !== null) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
  } else {
    discount = Math.min(coupon.discountValue, purchaseAmount);
  }

  return {
    coupon,
    discount,
  };
};

export default {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
};

