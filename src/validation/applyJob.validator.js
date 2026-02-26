import Joi from "joi";
import { HIRING_FOR_OPTIONS } from "../models/ApplyJob.js";

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
  hiringFor: Joi.string()
    .valid(...HIRING_FOR_OPTIONS)
    .required()
    .messages({
      "any.only": `hiringFor must be one of: ${HIRING_FOR_OPTIONS.join(", ")}`,
      "any.required": "Hiring for (role) is required",
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
  hiringFor: Joi.string()
    .valid(...HIRING_FOR_OPTIONS)
    .optional()
    .messages({
      "any.only": `hiringFor must be one of: ${HIRING_FOR_OPTIONS.join(", ")}`,
    }),
  perMinuteRate: Joi.number().min(0).optional(),
  location: Joi.string().trim().allow("").optional(),
  language: Joi.string().trim().allow("").optional(),
});

export default { createApplyJob, updateApplyJob };
