import Joi from "joi";

export const initiateOlympiadPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().optional().allow("", null), // For future use if coupons apply
});

export const completeOlympiadRegistration = Joi.object({
  razorpayOrderId: Joi.string().required(),
  razorpayPaymentId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});

export default {
  initiateOlympiadPayment,
  completeOlympiadRegistration,
};
