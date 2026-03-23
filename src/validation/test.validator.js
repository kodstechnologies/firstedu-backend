import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// Test
const createTest = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  questionBank: objectId.required(),
  durationMinutes: Joi.number().integer().min(1).required(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: Joi.number().min(0).default(0),
  applicableFor: Joi.string()
    .valid("test", "testBundle", "olympiad", "tournament", "challenge_yourself", "everyday_challenge", "challenge_yourfriends")
    .default("test"),
  isPublished: Joi.boolean().optional(),
});

const updateTest = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  questionBank: objectId.optional(),
  durationMinutes: Joi.number().integer().min(1).optional(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: Joi.number().min(0).optional(),
  applicableFor: Joi.string()
    .valid("test", "testBundle", "olympiad", "tournament", "challenge_yourself", "everyday_challenge", "challenge_yourfriends")
    .optional(),
  isPublished: Joi.boolean().optional(),
});

// Test Bundle
const createBundle = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  tests: Joi.array().items(objectId).min(1).required(),
  price: Joi.number().min(0).default(0),
  isActive: Joi.boolean().optional(),
});

const updateBundle = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  tests: Joi.array().items(objectId).optional(),
  price: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createTest,
  updateTest,
  createBundle,
  updateBundle,
};


