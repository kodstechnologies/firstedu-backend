import Joi from "joi";

const QNA_SUBJECTS = ["general", "test_and_exams", "teacher_connect", "payment"];

const createQnA = Joi.object({
  question: Joi.string().trim().required().messages({
    "string.empty": "Question is required",
    "any.required": "Question is required",
  }),
  answer: Joi.string().trim().required().messages({
    "string.empty": "Answer is required",
    "any.required": "Answer is required",
  }),
  subject: Joi.string()
    .valid(...QNA_SUBJECTS)
    .required()
    .messages({
      "any.only": `Subject must be one of: ${QNA_SUBJECTS.join(", ")}`,
      "any.required": "Subject is required",
    }),
});

const updateQnA = Joi.object({
  question: Joi.string().trim().optional().messages({
    "string.empty": "Question cannot be empty",
  }),
  answer: Joi.string().trim().optional().messages({
    "string.empty": "Answer cannot be empty",
  }),
  subject: Joi.string()
    .valid(...QNA_SUBJECTS)
    .optional()
    .messages({
      "any.only": `Subject must be one of: ${QNA_SUBJECTS.join(", ")}`,
    }),
});

export default { createQnA, updateQnA };
