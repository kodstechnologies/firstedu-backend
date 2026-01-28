import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createCourseTestLink = Joi.object({
  course: objectId.required(),
  test: objectId.required(),
  order: Joi.number().integer().min(0).default(0),
  isRequired: Joi.boolean().default(true),
});

const updateCourseTestLink = Joi.object({
  order: Joi.number().integer().min(0).optional(),
  isRequired: Joi.boolean().optional(),
});

export default {
  createCourseTestLink,
  updateCourseTestLink,
};

