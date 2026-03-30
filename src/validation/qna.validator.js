import Joi from "joi";

const createQnA = Joi.object({
  question: Joi.string().required().trim(),
  answer: Joi.string().trim().optional().allow("", null),
  subject: Joi.string().required().trim(),
  status: Joi.string().valid("pending", "approved").default("pending"),
});

const updateQnA = Joi.object({
  question: Joi.string().trim().optional(),
  answer: Joi.string().trim().optional().allow("", null),
  subject: Joi.string().trim().optional(),
  status: Joi.string().valid("pending", "approved").optional(),
});

export default {
  createQnA,
  updateQnA,
};
