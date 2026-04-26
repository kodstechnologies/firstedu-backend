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
    .valid("all", "Test", "TestSeries", "Course", "Olympiads", "Tournament", "Workshop", "Ecommerce", "LiveCompetition","CompetitionCategory", "School", "Competitive", "Skill Development")
    .default("all"),
});

/**
 * Student: Apply/validate coupon for discount preview.
 * itemType: test | testBundle | course | tournament | workshop | ecommerce | all
 * - "all" = universal coupon, works wherever there's an amount (test, bundle, course, event, merchandise)
 */
const applyCoupon = Joi.object({
  code: Joi.string().required().trim(),
  amount: Joi.number().min(0).required(),
  itemType: Joi.string()
    .valid("test", "testBundle", "course","Olympiads", "tournament", "workshop", "ecommerce", "all", "LiveCompetition", "liveCompetition", "live_competition","competitionCategory", "School", "Competitive", "Skill Development")
    .default("all"),
  categoryId: Joi.string().optional().allow(null, ""),
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
    .valid("all", "Test", "TestSeries", "Course", "Olympiads", "Tournament", "Workshop", "Ecommerce", "LiveCompetition","CompetitionCategory", "School", "Competitive", "Skill Development")
    .optional(),
});

export default {
  createCoupon,
  updateCoupon,
  applyCoupon,
};

