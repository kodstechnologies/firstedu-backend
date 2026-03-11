import Joi from "joi";

const initiateRecharge = Joi.object({
  amount: Joi.number().positive().min(1).required(),
});

const completeRecharge = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default {
  initiateRecharge,
  completeRecharge,
};

