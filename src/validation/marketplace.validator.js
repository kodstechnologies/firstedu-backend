import Joi from "joi";

const createCourseOrder = Joi.object({}).optional();

const purchaseCourse = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const initiateTestPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
});

const purchaseTest = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const initiateTestBundlePayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
});

const purchaseTestBundle = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default {
  createCourseOrder,
  purchaseCourse,
  initiateTestPayment,
  purchaseTest,
  initiateTestBundlePayment,
  purchaseTestBundle,
};

