import Joi from "joi";

/** Course: free, wallet, razorpay (same as initiateTestPayment) */
const initiateCoursePayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const purchaseCourse = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const initiateTestPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const purchaseTest = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const initiateTestBundlePayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const purchaseTestBundle = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default {
  initiateCoursePayment,
  purchaseCourse,
  initiateTestPayment,
  purchaseTest,
  initiateTestBundlePayment,
  purchaseTestBundle,
};

