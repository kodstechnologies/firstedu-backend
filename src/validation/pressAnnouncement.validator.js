import Joi from "joi";
import { PRESS_ANNOUNCEMENT_TYPES } from "../models/PressAnnouncement.js";

const createPressAnnouncement = Joi.object({
  pressname: Joi.string().trim().required().messages({
    "string.empty": "Press name is required",
    "any.required": "Press name is required",
  }),
  type: Joi.string()
    .valid(...PRESS_ANNOUNCEMENT_TYPES)
    .required()
    .messages({
      "any.only": `Type must be one of: ${PRESS_ANNOUNCEMENT_TYPES.join(", ")}`,
      "any.required": "Type is required",
    }),
  title: Joi.string().trim().required().messages({
    "string.empty": "Title is required",
    "any.required": "Title is required",
  }),
  description: Joi.string().trim().required().messages({
    "string.empty": "Description is required",
    "any.required": "Description is required",
  }),
  highlights: Joi.array().items(Joi.string().trim()).default([]).messages({
    "array.base": "Highlights must be an array of strings",
  }),
});

const updatePressAnnouncement = Joi.object({
  pressname: Joi.string().trim().optional().messages({
    "string.empty": "Press name cannot be empty",
  }),
  type: Joi.string()
    .valid(...PRESS_ANNOUNCEMENT_TYPES)
    .optional()
    .messages({
      "any.only": `Type must be one of: ${PRESS_ANNOUNCEMENT_TYPES.join(", ")}`,
    }),
  title: Joi.string().trim().optional().messages({
    "string.empty": "Title cannot be empty",
  }),
  description: Joi.string().trim().optional().messages({
    "string.empty": "Description cannot be empty",
  }),
  highlights: Joi.array().items(Joi.string().trim()).optional().messages({
    "array.base": "Highlights must be an array of strings",
  }),
});

export default { createPressAnnouncement, updatePressAnnouncement };
