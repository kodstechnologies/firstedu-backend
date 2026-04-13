import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const initiateCategoryPurchase = Joi.object({
  categoryId: objectId.required(),
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().allow("", null).optional(),
});

const confirmCategoryPurchase = Joi.object({
  categoryId: objectId.required(),
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default {
  initiateCategoryPurchase,
  confirmCategoryPurchase,
};
