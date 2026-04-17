import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
const priceSchema = Joi.number().min(0).precision(2);

// Test
const createTest = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  questionBank: objectId.required(),
  durationMinutes: Joi.number().integer().min(1).required(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: priceSchema.default(0),
  applicableFor: Joi.string()
    .valid(
      "test",
      "testBundle",
      "olympiad",
      "tournament",
      "challenge_yourself",
      "competition_sector",
      "everyday_challenge",
      "challenge_yourfriends",
      "school",
      "skill",
      "certificate"
    )
    .default("test"),
  isPublished: Joi.boolean().optional(),
  categoryId: objectId.optional().allow(null),
});

const updateTest = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  questionBank: objectId.optional(),
  durationMinutes: Joi.number().integer().min(1).optional(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: priceSchema.optional(),
  applicableFor: Joi.string()
    .valid(
      "test",
      "testBundle",
      "olympiad",
      "tournament",
      "challenge_yourself",
      "competition_sector",
      "everyday_challenge",
      "challenge_yourfriends",
      "school",
      "skill",
      "certificate"
    )
    .optional(),
  isPublished: Joi.boolean().optional(),
  categoryId: objectId.optional().allow(null),
});

// Test Bundle
const createBundle = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  tests: Joi.array().items(objectId).min(1).required(),
  price: priceSchema.default(0),
  isActive: Joi.boolean().optional(),
});

const updateBundle = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  tests: Joi.array().items(objectId).optional(),
  price: priceSchema.optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createTest,
  updateTest,
  createBundle,
  updateBundle,
};
