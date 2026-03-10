import Joi from "joi";

const createCoupon = Joi.object({
  code: Joi.string().required().trim().uppercase(),
  description: Joi.string().trim().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().positive().required(),
  validFrom: Joi.date().required(),
  validUntil: Joi.date().greater(Joi.ref("validFrom")).required(),
  usageLimit: Joi.number().integer().positive().allow(null).optional(),
  isActive: Joi.boolean().default(true),
  applicableTo: Joi.string()
    .valid("all", "Test", "TestSeries", "Course", "Olympiad", "Tournament", "Workshop", "Ecommerce")
    .default("all"),
});

const updateCoupon = Joi.object({
  code: Joi.string().trim().uppercase().optional(),
  description: Joi.string().trim().optional().allow(""),
  discountType: Joi.string().valid("percentage", "fixed").optional(),
  discountValue: Joi.number().positive().optional(),
  validFrom: Joi.date().optional(),
  validUntil: Joi.date().optional(),
  usageLimit: Joi.number().integer().positive().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  applicableTo: Joi.string()
    .valid("all", "Test", "TestSeries", "Course", "Olympiad", "Tournament", "Workshop", "Ecommerce")
    .optional(),
});

export default {
  createCoupon,
  updateCoupon,
};

