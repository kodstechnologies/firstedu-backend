import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import couponService from "../services/coupon.service.js";
import couponValidator from "../validation/coupon.validator.js";

/**
 * Create a new coupon
 */
export const createCoupon = asyncHandler(async (req, res) => {
  const { error, value } = couponValidator.createCoupon.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const coupon = await couponService.createCoupon(value);

  return res
    .status(201)
    .json(ApiResponse.success(coupon, "Coupon created successfully"));
});

/**
 * Get all coupons
 */
export const getCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, isActive } = req.query;

  const result = await couponService.getCoupons(page, limit, isActive);

  return res.status(200).json(
    ApiResponse.success(
      result.coupons,
      "Coupons fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get coupon by ID
 */
export const getCouponById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const coupon = await couponService.getCouponById(id);

  return res
    .status(200)
    .json(ApiResponse.success(coupon, "Coupon fetched successfully"));
});

/**
 * Update coupon
 */
export const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = couponValidator.updateCoupon.validate(req.body);

  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const coupon = await couponService.updateCoupon(id, value);

  return res
    .status(200)
    .json(ApiResponse.success(coupon, "Coupon updated successfully"));
});

/**
 * Delete coupon
 */
export const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await couponService.deleteCoupon(id);

  return res
    .status(200)
    .json(ApiResponse.success(null, result.message));
});

export default {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
};

