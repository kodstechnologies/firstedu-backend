import Joi from "joi";

const createCoupon = Joi.object({
  code: Joi.string().required().trim().uppercase(),
  description: Joi.string().trim().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().positive().required(),
  minPurchaseAmount: Joi.number().min(0).default(0),
  maxDiscountAmount: Joi.number().positive().allow(null).optional(),
  validFrom: Joi.date().required(),
  validUntil: Joi.date().greater(Joi.ref("validFrom")).required(),
  usageLimit: Joi.number().integer().positive().allow(null).optional(),
  isActive: Joi.boolean().default(true),
  applicableTo: Joi.string()
    .valid("all", "courses", "tests", "bundles")
    .default("all"),
});

const updateCoupon = Joi.object({
  code: Joi.string().trim().uppercase().optional(),
  description: Joi.string().trim().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").optional(),
  discountValue: Joi.number().positive().optional(),
  minPurchaseAmount: Joi.number().min(0).optional(),
  maxDiscountAmount: Joi.number().positive().allow(null).optional(),
  validFrom: Joi.date().optional(),
  validUntil: Joi.date().optional(),
  usageLimit: Joi.number().integer().positive().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  applicableTo: Joi.string()
    .valid("all", "courses", "tests", "bundles")
    .optional(),
});

export default {
  createCoupon,
  updateCoupon,
};

