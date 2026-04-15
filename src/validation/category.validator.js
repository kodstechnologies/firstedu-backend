import Joi from "joi";

// Recursive schema: each category can have optional nested children (unlimited depth)
const createCategorySchema = Joi.object({
  name: Joi.string().required().trim(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
  rootType: Joi.string()
    .valid("School Management", "Competitive Management", "Olympiads", "Skill Development", "custom")
    .optional(),
  isPredefined: Joi.boolean().optional(),
  children: Joi.array().items(Joi.link("#category")).optional(),
}).id("category");

const createCategory = createCategorySchema;

const updateCategory = Joi.object({
  name: Joi.string().trim().optional(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  rootType: Joi.string()
    .valid("School Management", "Competitive Management", "Olympiads", "Skill Development", "custom")
    .optional(),
  isPredefined: Joi.boolean().optional(),
});

/**
 * Subcategory details/pricing form.
 * All fields are strictly optional — no field is required.
 */
const updateCategoryPricing = Joi.object({
  // Pricing
  price:           Joi.number().min(0).precision(2).optional(),
  discountedPrice: Joi.number().min(0).precision(2).allow(null).optional(),
  isFree:          Joi.boolean().optional(),
  status:          Joi.string().valid("Draft", "Public").optional(),

  // Policy
  offerPolicy:     Joi.string().valid("inherit", "none").optional(),
  couponPolicy:    Joi.string().valid("inherit", "none").optional(),
  offerOverrideId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).allow(null, "").optional(),

  // Content
  description:         Joi.string().trim().allow("", null).optional(),
  about:               Joi.string().trim().allow("", null).optional(),
  syllabus:            Joi.string().trim().allow("", null).optional(),
  markingScheme:       Joi.string().trim().allow("", null).optional(),
  rankingCriteria:     Joi.string().trim().allow("", null).optional(),
  examDatesAndDetails: Joi.string().trim().allow("", null).optional(),
  awards:              Joi.string().trim().allow("", null).optional(),
  rules:               Joi.string().trim().allow("", null).optional(),

  // Media
  bannerImg: Joi.string().trim().allow("", null).optional(),

  // Classification
  subjects: Joi.array().items(Joi.string().trim()).optional(),
  tags:     Joi.array().items(Joi.string().trim()).optional(),

  // Capacity
  capacity: Joi.number().min(1).allow(null).optional(),
});

export default {
  createCategory,
  updateCategory,
  updateCategoryPricing,
};
