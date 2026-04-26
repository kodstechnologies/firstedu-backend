import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import couponService from "../services/coupon.service.js";
import couponValidator from "../validation/coupon.validator.js";

/**
 * Apply coupon - validate code and get discount for a purchase.
 * Works for: test, testBundle, course, olympiad, tournament, workshop, ecommerce, all.
 * - itemType "all": coupon applicableTo must be "all" (works on any amount system)
 * - Pass amount in rupees (or points for ecommerce) to get discounted price.
 */
export const applyCoupon = asyncHandler(async (req, res) => {
  const { error, value } = couponValidator.applyCoupon.validate(req.body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message)
    );
  }

  const { code, amount, itemType = "all", categoryId = null } = value;
  const purchaseAmount = Number(amount) || 0;

  if (purchaseAmount < 0) {
    throw new ApiError(400, "Amount must be a positive number");
  }

  const result = await couponService.validateCoupon(code, purchaseAmount, itemType, categoryId);

  const discountedPrice = Math.max(0, purchaseAmount - result.discount);

  const couponData = result.coupon.toObject ? result.coupon.toObject() : { ...result.coupon };
  const safeCoupon = {
    _id: couponData._id,
    code: couponData.code,
    description: couponData.description,
    discountType: couponData.discountType,
    discountValue: couponData.discountValue,
    applicableTo: couponData.applicableTo,
    validFrom: couponData.validFrom,
    validUntil: couponData.validUntil,
  };

  return res.status(200).json(
    ApiResponse.success(
      {
        coupon: safeCoupon,
        originalPrice: purchaseAmount,
        discount: result.discount,
        discountedPrice,
      },
      "Coupon applied successfully"
    )
  );
});

export default {
  applyCoupon,
};
