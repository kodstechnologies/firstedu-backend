import Joi from "joi";

const createSuccessStory = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  description: Joi.string().trim().required().messages({
    "string.empty": "Description is required",
    "any.required": "Description is required",
  }),
  achievement: Joi.string().trim().required().messages({
    "string.empty": "Achievement is required",
    "any.required": "Achievement is required",
  }),
  achieveIn: Joi.string().trim().required().messages({
    "string.empty": "Achieve in is required",
    "any.required": "Achieve in is required",
  }),
  status: Joi.string()
    .valid("DRAFT", "PUBLISHED")
    .optional()
    .messages({
      "any.only": "Status must be either DRAFT or PUBLISHED",
    }),
});

const updateSuccessStory = Joi.object({
  name: Joi.string().trim().optional().messages({
    "string.empty": "Name cannot be empty",
  }),
  description: Joi.string().trim().optional().messages({
    "string.empty": "Description cannot be empty",
  }),
  achievement: Joi.string().trim().optional().messages({
    "string.empty": "Achievement cannot be empty",
  }),
  achieveIn: Joi.string().trim().optional().messages({
    "string.empty": "Achieve in cannot be empty",
  }),
});

const updateStatus = Joi.object({
  status: Joi.string().valid("DRAFT", "PUBLISHED").required().messages({
    "any.only": "Status must be either DRAFT or PUBLISHED",
    "any.required": "Status is required",
  }),
});

export default {
  createSuccessStory,
  updateSuccessStory,
  updateStatus,
};
