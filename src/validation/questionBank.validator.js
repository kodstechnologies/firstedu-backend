import Joi from "joi";

const optionSchema = Joi.object({
  text: Joi.string().required(),
  isCorrect: Joi.boolean().default(false),
});

const sectionSchema = Joi.object({
  count: Joi.number().min(1).required(),
  difficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .required()
    .lowercase(),
  id: Joi.number().optional(),
  name: Joi.string().trim().optional(),
});

const questionItemSchema = Joi.object({
  questionText: Joi.string().required().trim(),
  questionType: Joi.string()
    .valid("single", "multiple", "true_false", "connected")
    .default("single"),
  options: Joi.when("questionType", {
    is: Joi.string().valid("single", "multiple"),
    then: Joi.array().items(optionSchema).min(2).required(),
    otherwise: Joi.when("questionType", {
      is: "true_false",
      then: Joi.array().items(optionSchema).length(2).optional(),
      otherwise: Joi.optional(),
    }),
  }),
  correctAnswer: Joi.when("questionType", {
    is: "single",
    then: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    otherwise: Joi.when("questionType", {
      is: "multiple",
      then: Joi.array()
        .items(Joi.alternatives().try(Joi.string(), Joi.number()))
        .min(1)
        .required(),
      is: "true_false",
      then: Joi.boolean().required(),
      otherwise: Joi.optional(),
    }),
  }),
  explanation: Joi.string().trim().optional(),
  categoryId: Joi.string().optional(),
  subject: Joi.string().trim().optional(),
  topic: Joi.string().trim().optional(),
  difficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .optional()
    .lowercase(),
  marks: Joi.number().min(0).default(1),
  negativeMarks: Joi.number().min(0).default(0),
  tags: Joi.array().items(Joi.string().trim()).optional(),
});

const createQuestionBank = Joi.object({
  name: Joi.string().required().trim(),
  categories: Joi.array().items(Joi.string()).min(1).required(),
  useSectionWiseDifficulty: Joi.boolean().default(false),
  overallDifficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .default("medium"),
  sections: Joi.when("useSectionWiseDifficulty", {
    is: true,
    then: Joi.array().items(sectionSchema).min(1).required(),
    otherwise: Joi.array().optional(),
  }),
});

const createQuestionBankWithQuestions = Joi.object({
  name: Joi.string().required().trim(),
  categories: Joi.array().items(Joi.string()).min(1).required(),
  useSectionWiseDifficulty: Joi.boolean().default(false),
  overallDifficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .default("medium"),
  sections: Joi.when("useSectionWiseDifficulty", {
    is: true,
    then: Joi.array().items(sectionSchema).min(1).required(),
    otherwise: Joi.array().optional(),
  }),
  questions: Joi.array().items(questionItemSchema).min(1).required(),
});

const updateQuestionBank = Joi.object({
  name: Joi.string().trim().optional(),
  categories: Joi.array().items(Joi.string()).min(1).optional(),
  useSectionWiseDifficulty: Joi.boolean().optional(),
  overallDifficulty: Joi.string().valid("easy", "medium", "hard").optional(),
  sections: Joi.array().items(sectionSchema).optional(),
});

export default {
  createQuestionBank,
  createQuestionBankWithQuestions,
  updateQuestionBank,
};
