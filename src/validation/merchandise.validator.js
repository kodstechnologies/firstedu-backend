import Joi from "joi";

const deliveryAddressSchema = Joi.object({
  fullName: Joi.string().required().trim(),
  phone: Joi.string().required().trim(),
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

const createMerchandise = Joi.object({
  name: Joi.string().required().trim(),
  description: Joi.string().trim().optional().allow(""),
  imageUrl: Joi.string().uri().trim().optional().allow(""),
  pointsRequired: Joi.number().integer().min(0).required(),
  category: Joi.string().trim().default("general"),
  isPhysical: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
  stockQuantity: Joi.number().integer().min(0).allow(null).optional(),
});

const updateMerchandise = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().optional().allow(""),
  imageUrl: Joi.string().uri().trim().optional().allow(""),
  pointsRequired: Joi.number().integer().min(0).optional(),
  category: Joi.string().trim().optional(),
  isPhysical: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
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
  createMerchandise,
  updateMerchandise,
  updateClaimStatus,
};

