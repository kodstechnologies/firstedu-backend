import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
const priceSchema = Joi.number().min(0).precision(2);

const tournamentStageSchema = Joi.object({
  name: Joi.string().valid("Qualifier", "Semi-Final", "Final").required(),
  test: objectId.required(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().required().messages({
    "date.base": "Start time must be a valid date",
    "any.required": "Start time is required"
  }),
  endTime: Joi.date().required().messages({
    "date.base": "End time must be a valid date",
    "any.required": "End time is required"
  }),
  minimumMarksToQualify: Joi.number().min(0).default(0).optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
});

const createTournament = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  stages: Joi.array().items(tournamentStageSchema).min(1).required(),
  registrationStartTime: Joi.date().required().messages({
    "date.base": "Start time must be a valid date",
    "any.required": "registration start time is required"
  }),
  registrationEndTime: Joi.date().required().messages({
    "date.base": "registration end time must be a valid date",
    "any.required": "registration end time is required"
  }),
  price: priceSchema.optional(),
  firstPlacePoints: Joi.number().min(0).default(0).optional(),
  secondPlacePoints: Joi.number().min(0).default(0).optional(),
  thirdPlacePoints: Joi.number().min(0).default(0).optional(),
  isPublished: Joi.boolean().optional(),
});

const updateTournament = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  stages: Joi.array().items(tournamentStageSchema).optional(),
  registrationStartTime: Joi.date().optional(),
  registrationEndTime: Joi.date().optional(),
  price: priceSchema.optional(),
  firstPlacePoints: Joi.number().min(0).optional(),
  secondPlacePoints: Joi.number().min(0).optional(),
  thirdPlacePoints: Joi.number().min(0).optional(),
  isPublished: Joi.boolean().optional(),
});

const initiateTournamentPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const registerForTournament = Joi.object({
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
  createTournament,
  updateTournament,
  initiateTournamentPayment,
  registerForTournament,
  declareWinners,
};

