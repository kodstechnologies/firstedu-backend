import Joi from "joi";

const createBlog = Joi.object({
  title: Joi.string().trim().required().messages({
    "string.empty": "Blog title is required",
    "any.required": "Blog title is required",
  }),
  description: Joi.string().trim().required().messages({
    "string.empty": "Blog description is required",
    "any.required": "Blog description is required",
  }),
  subject: Joi.string().trim().required().messages({
    "string.empty": "Subject is required",
    "any.required": "Subject is required",
  }),
  keyTakeaways: Joi.array().items(Joi.string().trim()).default([]).messages({
    "array.base": "Key takeaways must be an array of strings",
  }),
});

const updateBlog = Joi.object({
  title: Joi.string().trim().optional().messages({
    "string.empty": "Blog title cannot be empty",
  }),
  description: Joi.string().trim().optional().messages({
    "string.empty": "Blog description cannot be empty",
  }),
  subject: Joi.string().trim().optional().messages({
    "string.empty": "Subject cannot be empty",
  }),
  keyTakeaways: Joi.array().items(Joi.string().trim()).optional().messages({
    "array.base": "Key takeaways must be an array of strings",
  }),
});

export default { createBlog, updateBlog };
