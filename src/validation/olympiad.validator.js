import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createOlympiad = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  rules: Joi.string().trim().allow("", null).optional(),
  testId: Joi.alternatives().try(objectId, Joi.string().required()).required(),
  registrationStartTime: Joi.date().required(),
  registrationEndTime: Joi.date().required(),
  price: Joi.number().min(0).default(0).optional(),
  firstPlacePoints: Joi.number().min(0).default(0).optional(),
  secondPlacePoints: Joi.number().min(0).default(0).optional(),
  thirdPlacePoints: Joi.number().min(0).default(0).optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  isPublished: Joi.boolean().optional(),
});

const updateOlympiad = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  rules: Joi.string().trim().allow("", null).optional(),
  testId: Joi.alternatives().try(objectId, Joi.string()).optional(),
  registrationStartTime: Joi.date().optional(),
  registrationEndTime: Joi.date().optional(),
  price: Joi.number().min(0).optional(),
  firstPlacePoints: Joi.number().min(0).optional(),
  secondPlacePoints: Joi.number().min(0).optional(),
  thirdPlacePoints: Joi.number().min(0).optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  isPublished: Joi.boolean().optional(),
});

const initiateOlympiadPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const registerForOlympiad = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const declareWinners = Joi.object({
  firstPlace: objectId.optional().allow(null, ""),
  secondPlace: objectId.optional().allow(null, ""),
  thirdPlace: objectId.optional().allow(null, ""),
  autoCalculate: Joi.boolean().optional(),
}).min(1);

export default {
  createOlympiad,
  updateOlympiad,
  initiateOlympiadPayment,
  registerForOlympiad,
  declareWinners,
};

