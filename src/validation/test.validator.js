import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// Test Category
const createCategory = Joi.object({
  name: Joi.string().trim().required(),
  slug: Joi.string().trim().lowercase().required(),
  description: Joi.string().trim().allow("", null),
  isActive: Joi.boolean().optional(),
});

const updateCategory = Joi.object({
  name: Joi.string().trim().optional(),
  slug: Joi.string().trim().lowercase().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  isActive: Joi.boolean().optional(),
});

// Test
const randomConfig = Joi.object({
  count: Joi.number().integer().min(1).max(60).required(),
});

const createTest = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  category: objectId.allow(null),
  testType: Joi.string()
    .valid("School", "Competitive", "Olympiads", "Skill Development")
    .default("Competitive"),
  durationMinutes: Joi.number().integer().min(1).required(),
  negativeMarksPerQuestion: Joi.number().min(0).default(0),
  proctoringInstructions: Joi.string().trim().optional(),
  price: Joi.number().min(0).default(0),
  selectionMode: Joi.string().valid("manual", "random").default("manual"),
  questions: Joi.when("selectionMode", {
    is: "manual",
    then: Joi.array().items(objectId).min(1).max(60).required(),
    otherwise: Joi.forbidden(),
  }),
  randomConfig: Joi.when("selectionMode", {
    is: "random",
    then: randomConfig.required(),
    otherwise: Joi.forbidden(),
  }),
  isPublished: Joi.boolean().optional(),
});

const updateTest = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  category: objectId.allow(null).optional(),
  testType: Joi.string()
    .valid("School", "Competitive", "Olympiads", "Skill Development")
    .optional(),
  durationMinutes: Joi.number().integer().min(1).optional(),
  negativeMarksPerQuestion: Joi.number().min(0).optional(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: Joi.number().min(0).optional(),
  selectionMode: Joi.string().valid("manual", "random").optional(),
  questions: Joi.array().items(objectId).max(60).optional(),
  randomConfig: randomConfig.optional(),
  isPublished: Joi.boolean().optional(),
});

// Test Bundle
const createBundle = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  category: objectId.allow(null),
  tests: Joi.array().items(objectId).min(1).required(),
  price: Joi.number().min(0).default(0),
  isActive: Joi.boolean().optional(),
});

const updateBundle = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  category: objectId.allow(null).optional(),
  tests: Joi.array().items(objectId).optional(),
  price: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createCategory,
  updateCategory,
  createTest,
  updateTest,
  createBundle,
  updateBundle,
};


