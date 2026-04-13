import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import categoryPurchaseService from "../services/categoryPurchase.service.js";
import categoryPurchaseValidator from "../validation/categoryPurchase.validator.js";

export const initiateCategoryPurchase = asyncHandler(async (req, res) => {
  const { error, value } = categoryPurchaseValidator.initiateCategoryPurchase.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const result = await categoryPurchaseService.initiatePurchase(
    value.categoryId,
    req.user._id,
    value.paymentMethod,
    { couponCode: value.couponCode }
  );

  return res.status(200).json(ApiResponse.success(result, "Purchase initiated successfully"));
});

export const confirmCategoryPurchase = asyncHandler(async (req, res) => {
  const { error, value } = categoryPurchaseValidator.confirmCategoryPurchase.validate(req.body);
  if (error) throw new ApiError(400, "Validation Error", error.details.map(x => x.message));

  const result = await categoryPurchaseService.confirmPurchase(
    value.categoryId,
    req.user._id,
    {
      razorpayOrderId: value.razorpayOrderId,
      razorpayPaymentId: value.razorpayPaymentId,
      razorpaySignature: value.razorpaySignature,
    }
  );

  return res.status(200).json(ApiResponse.success(result, "Purchase confirmed successfully"));
});

export const getMyCategoryPurchases = asyncHandler(async (req, res) => {
  const { pillarType } = req.query;
  const purchases = await categoryPurchaseService.getMyPurchases(req.user._id, pillarType);
  return res.status(200).json(ApiResponse.success(purchases, "Purchases fetched successfully"));
});

export const checkCategoryAccess = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const hasAccess = await categoryPurchaseService.checkAccess(req.user._id, categoryId);
  return res.status(200).json(ApiResponse.success({ hasAccess: !!hasAccess }, "Access check complete"));
});
