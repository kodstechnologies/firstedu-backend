import Joi from "joi";

const optionSchema = Joi.object({
  text: Joi.string().required(),
  isCorrect: Joi.boolean().default(false),
});

const createQuestion = Joi.object({
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
    then: Joi.alternatives()
      .try(Joi.string(), Joi.number())
      .required(),
    otherwise: Joi.when("questionType", {
      is: "multiple",
      then: Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.number())).min(1).required(),
      is: "true_false",
      then: Joi.boolean().required(),
      otherwise: Joi.optional(),
    }),
  }),
  explanation: Joi.string().trim().optional(),
  subject: Joi.string().trim().optional(),
  categoryRef: Joi.string().optional(),
  questionBank: Joi.string().optional(),
  sectionIndex: Joi.number().min(0).optional(),
  orderInBank: Joi.number().min(0).optional(),
  topic: Joi.string().trim().optional(),
  difficulty: Joi.string().valid("easy", "medium", "hard").default("medium"),
  marks: Joi.number().min(0).default(1),
  negativeMarks: Joi.number().min(0).default(0),
  tags: Joi.array().items(Joi.string().trim()).optional(),
  isParent: Joi.boolean().default(false),
  parentQuestionId: Joi.string().optional().allow(null),
  passage: Joi.when("isParent", {
    is: true,
    then: Joi.string().required().trim(),
    otherwise: Joi.string().optional().allow(null, ""),
  }),
});

const updateQuestion = Joi.object({
  questionText: Joi.string().trim().optional(),
  questionType: Joi.string()
    .valid("single", "multiple", "true_false", "connected")
    .optional(),
  options: Joi.array().items(optionSchema).optional(),
  correctAnswer: Joi.alternatives()
    .try(Joi.string(), Joi.number(), Joi.boolean(), Joi.array())
    .optional(),
  explanation: Joi.string().trim().optional(),
  subject: Joi.string().trim().optional(),
  categoryRef: Joi.string().optional().allow(null),
  questionBank: Joi.string().optional().allow(null),
  sectionIndex: Joi.number().min(0).optional(),
  orderInBank: Joi.number().min(0).optional(),
  topic: Joi.string().trim().optional(),
  difficulty: Joi.string().valid("easy", "medium", "hard").optional(),
  marks: Joi.number().min(0).optional(),
  negativeMarks: Joi.number().min(0).optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),
  isParent: Joi.boolean().optional(),
  parentQuestionId: Joi.string().optional().allow(null),
  passage: Joi.string().trim().optional().allow(null, ""),
  isActive: Joi.boolean().optional(),
});

const addChildQuestion = Joi.object({
  childQuestionId: Joi.string().required(),
});

const calculateAnalytics = Joi.object({
  upperGroupCorrect: Joi.number().min(0).required(),
  lowerGroupCorrect: Joi.number().min(0).required(),
  upperGroupTotal: Joi.number().min(0).required(),
  lowerGroupTotal: Joi.number().min(0).required(),
});

export default {
  createQuestion,
  updateQuestion,
  addChildQuestion,
  calculateAnalytics,
};

