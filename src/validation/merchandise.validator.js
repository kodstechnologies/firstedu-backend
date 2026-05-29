import Joi from "joi";

const deliveryAddressSchema = Joi.object({
  fullName: Joi.string().required().trim(),
  phone:Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({
      "string.empty": "Phone number is required",
      "string.pattern.base": "Enter a valid 10-digit mobile number",
    }),
  addressLine1: Joi.string().required().trim(),
  addressLine2: Joi.string().trim().optional().allow(""),
  city: Joi.string().required().trim(),
  state: Joi.string().required().trim(),
  postalCode: Joi.string().required().trim(),
  country: Joi.string().trim().default("India"),
});

const claimMerchandise = Joi.object({
  deliveryAddress: Joi.when("$isPhysical", {
    is: true,
    then: deliveryAddressSchema.required(),
    otherwise: Joi.optional(),
  }),
});

const initiateMerchandisePayment = Joi.object({
  paymentMethod: Joi.string()
    .valid("free", "wallet", "razorpay")
    .required(),
  couponCode: Joi.string().trim().optional().allow("", null),
  deliveryAddress: Joi.when("paymentMethod", {
    is: Joi.valid("free", "wallet"),
    then: Joi.when("$isPhysical", {
      is: true,
      then: deliveryAddressSchema.required(),
      otherwise: Joi.optional()
    }),
    otherwise: Joi.optional() // razorpay doesn't need address on init
  })
});

const confirmMerchandisePayment = Joi.object({
  razorpayPaymentId: Joi.string().required(),
  razorpayOrderId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
  deliveryAddress: Joi.when("$isPhysical", {
    is: true,
    then: deliveryAddressSchema.required(),
    otherwise: Joi.optional(),
  })
});

const createMerchandise = Joi.object({
  name: Joi.string().required().trim(),
  description: Joi.string().trim().optional().allow(""),
  imageUrl: Joi.string().trim().optional().allow("").empty(""),
  pointsRequired: Joi.number().integer().min(0).required(),
  price: Joi.number().min(0).optional().default(0),

  isActive: Joi.boolean().truthy("true", "1").falsy("false", "0").default(true),
  stockQuantity: Joi.number().integer().min(0).allow(null).optional(),
});

const updateMerchandise = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().optional().allow(""),
  imageUrl: Joi.string().trim().optional().allow("").empty(""),
  pointsRequired: Joi.number().integer().min(0).optional(),
  price: Joi.number().min(0).optional(),

  isActive: Joi.boolean().truthy("true", "1").falsy("false", "0").optional(),
  stockQuantity: Joi.number().integer().min(0).allow(null).optional(),
});

const updateClaimStatus = Joi.object({
  status: Joi.string()
    .valid("pending", "processing", "shipped", "delivered", "cancelled")
    .required(),
  trackingNumber: Joi.string().trim().optional().allow(""),
});

export default {
  claimMerchandise,
  initiateMerchandisePayment,
  confirmMerchandisePayment,
  createMerchandise,
  updateMerchandise,
  updateClaimStatus,
};
