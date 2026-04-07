import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createCourse = Joi.object({
  title: Joi.string().trim().required().messages({
    "string.base": "Title must be a string",
    "string.empty": "Title cannot be empty",
    "any.required": "Title is required",
  }),
  description: Joi.string().trim().allow("", null),
  price: Joi.number().min(0).default(0),
  isPublished: Joi.boolean().optional(),
  categoryIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
    .required()
    .messages({
      "any.required": "category is required",
      "alternatives.match": "Invalid category",
    }),
});

const updateCourse = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  price: Joi.number().min(0).optional(),
  isPublished: Joi.boolean().optional(),
  categoryIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
     .required()
    .messages({
      "any.required": "category is required",
      "alternatives.match": "Invalid category",
    }),
});

export default {
  createCourse,
  updateCourse,
};
