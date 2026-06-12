import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);
const priceSchema = Joi.number().min(0).precision(2);

// Test
const bankLinkSchema = Joi.object({
  questionBank: objectId.optional(),
  aiQuestionBank: objectId.optional(),
}).custom((value, helpers) => {
  const hasManual = !!value.questionBank;
  const hasAi = !!value.aiQuestionBank;
  if (hasManual === hasAi) {
    return helpers.message(
      "Exactly one of questionBank or aiQuestionBank is required"
    );
  }
  return value;
});

const createTest = bankLinkSchema.keys({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  durationMinutes: Joi.number().integer().min(1).required(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: priceSchema.default(0),
  applicableFor: Joi.string()
    .valid(
      "test",
      "testBundle",
      "Olympiads",
      "tournament",
      "challenge_yourself",
      "challenge_your_friend",
      "competition_sector",
      "everyday_challenge",
      "skill",
      "certificate",
      "School",
      "Competitive",
      "Skill Development",
      "trending_test"
    )
    .default("test"),
  isPublished: Joi.boolean().optional(),
  categoryId: objectId.optional().allow(null),
  rewardPoints: Joi.number().min(0).optional(),
  gamificationLevel: Joi.number().integer().min(1).optional(),
  passingPercentage: Joi.number().integer().min(0).max(100).optional(),
});

const updateTest = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  questionBank: objectId.optional().allow(null),
  aiQuestionBank: objectId.optional().allow(null),
  durationMinutes: Joi.number().integer().min(1).optional(),
  proctoringInstructions: Joi.string().trim().optional(),
  price: priceSchema.optional(),
  applicableFor: Joi.string()
    .valid(
      "test",
      "testBundle",
      "Olympiads",
      "tournament",
      "challenge_yourself",
      "challenge_your_friend",
      "competition_sector",
      "everyday_challenge",
      "skill",
      "certificate",
      "School",
      "Competitive",
      "Skill Development",
      "trending_test"
    )
    .optional(),
  isPublished: Joi.boolean().optional(),
  categoryId: objectId.optional().allow(null),
  rewardPoints: Joi.number().min(0).optional(),
  gamificationLevel: Joi.number().integer().min(1).optional(),
  passingPercentage: Joi.number().integer().min(0).max(100).optional(),
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
