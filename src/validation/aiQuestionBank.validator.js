import Joi from "joi";

const optionSchema = Joi.object({
  text: Joi.string().required(),
  isCorrect: Joi.boolean().default(false),
});

const aiQuestionItemSchema = Joi.object({
  questionText: Joi.string().required().trim(),
  questionType: Joi.string()
    .valid("single", "multiple", "true_false")
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
      otherwise: Joi.boolean().required(),
    }),
  }),
  explanation: Joi.string().trim().required(),
  subject: Joi.string().trim().optional(),
  topic: Joi.string().trim().optional(),
  difficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .optional()
    .lowercase(),
  marks: Joi.number().min(0).default(1),
  negativeMarks: Joi.number().min(0).default(0),
  tags: Joi.array().items(Joi.string().trim()).optional(),
  aiBatchNumber: Joi.number().integer().min(1).optional(),
  sectionIndex: Joi.number().integer().min(0).optional().allow(null),
});

const sectionSchema = Joi.object({
  count: Joi.number().min(1).required(),
  difficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .required()
    .lowercase(),
  id: Joi.number().optional(),
  name: Joi.string().trim().optional(),
  timeMinutes: Joi.number().min(0).optional().default(0),
});

const createAiQuestionBankWithQuestions = Joi.object({
  name: Joi.string().required().trim(),
  categories: Joi.array().items(Joi.string()).min(1).required(),
  overallDifficulty: Joi.string()
    .valid("easy", "medium", "hard")
    .default("medium"),
  generationTopic: Joi.string().trim().allow("", null).optional(),
  aiProvider: Joi.string().trim().default("gemini"),
  useSectionWise: Joi.boolean().default(false),
  sections: Joi.array()
    .items(sectionSchema)
    .when("useSectionWise", {
      is: true,
      then: Joi.array().items(sectionSchema).min(1).required(),
    })
    .optional(),
  questions: Joi.array().items(aiQuestionItemSchema).min(1).required(),
});

export default {
  createAiQuestionBankWithQuestions,
};
