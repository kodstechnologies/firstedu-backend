import Joi from "joi";

const createForum = Joi.object({
  title: Joi.string().trim().required().messages({
    "string.empty": "Title is required",
    "any.required": "Title is required",
  }),
  description: Joi.string().trim().allow("", null).optional(),
  tags: Joi.array().items(Joi.string().trim()).optional().default([]),
  topic: Joi.string().trim().required().messages({
    "string.empty": "Topic is required",
    "any.required": "Topic is required",
  }),
});

const updateForum = Joi.object({
  title: Joi.string().trim().optional().messages({
    "string.empty": "Title cannot be empty",
  }),
  description: Joi.string().trim().allow("", null).optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),
  topic: Joi.string().trim().optional().messages({
    "string.empty": "Topic cannot be empty",
  }),
});

const addComment = Joi.object({
  content: Joi.string().trim().required().messages({
    "string.empty": "Content is required",
    "any.required": "Content is required",
  }),
});

const replyToComment = Joi.object({
  content: Joi.string().trim().required().messages({
    "string.empty": "Content is required",
    "any.required": "Content is required",
  }),
});

export default {
  createForum,
  updateForum,
  addComment,
  replyToComment,
};
