import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
const priceSchema = Joi.number().min(0).precision(2);

const createWorkshop = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  teacherId: objectId.required(),
  startTime: Joi.date().required().messages({
    "date.base": "Start time must be a valid date",
    "any.required": "Start time is required"
  }),
  endTime: Joi.date().required().messages({
    "date.base": "End time must be a valid date",
    "any.required": "End time is required"
  }),
  meetingLink: Joi.string().trim().uri().required(),
  meetingPassword: Joi.string().trim().optional().allow("", null),
  price: priceSchema.default(0).optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  registrationStartTime: Joi.date().required(),
  registrationEndTime: Joi.date().required(),
  eventType: Joi.string()
    .valid("workshop", "essay", "poem", "dance", "singing", "other")
    .default("workshop")
    .optional(),
  isPublished: Joi.boolean().optional(),
});

const updateWorkshop = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  teacherId: objectId.optional(),
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  meetingLink: Joi.string().trim().uri().optional(),
  meetingPassword: Joi.string().trim().optional().allow("", null),
  price: priceSchema.optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  registrationStartTime: Joi.date().optional(),
  registrationEndTime: Joi.date().optional(),
  eventType: Joi.string()
    .valid("workshop", "essay", "poem", "dance", "singing", "other")
    .optional(),
  isPublished: Joi.boolean().optional(),
});

const initiateWorkshopPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().optional().allow("", null),
});

const registerForWorkshop = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

export default {
  createWorkshop,
  updateWorkshop,
  initiateWorkshopPayment,
  registerForWorkshop,
};

