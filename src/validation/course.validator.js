import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createCourse = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null),
  price: Joi.number().min(0).default(0),
  isPublished: Joi.boolean().optional(),
});

const updateCourse = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  price: Joi.number().min(0).optional(),
  isPublished: Joi.boolean().optional(),
});


export default {
  createCourse,
  updateCourse,
};

