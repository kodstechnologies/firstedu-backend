import Joi from "joi";

const createApplyJob = Joi.object({
  title: Joi.string().trim().required().messages({
    "string.empty": "Title is required",
    "any.required": "Title is required",
  }),
  skills: Joi.array().items(Joi.string().trim()).default([]).messages({
    "array.base": "Skills must be an array of strings",
  }),
  experience: Joi.string().trim().required().messages({
    "string.empty": "Experience is required",
    "any.required": "Experience is required",
  }),

  perMinuteRate: Joi.number().min(0).required().messages({
    "number.base": "Per minute rate is required",
    "any.required": "Per minute rate is required",
  }),
  location: Joi.string().trim().allow("").optional(),
  language: Joi.string().trim().allow("").optional(),
});

const updateApplyJob = Joi.object({
  title: Joi.string().trim().optional(),
  skills: Joi.array().items(Joi.string().trim()).optional(),
  experience: Joi.string().trim().optional(),

  perMinuteRate: Joi.number().min(0).optional(),
  location: Joi.string().trim().allow("").optional(),
  language: Joi.string().trim().allow("").optional(),
});

export default { createApplyJob, updateApplyJob };
