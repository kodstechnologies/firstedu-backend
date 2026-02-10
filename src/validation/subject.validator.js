import Joi from "joi";

const createSubject = Joi.object({
  name: Joi.string().required().trim(),
  classType: Joi.string().required(),
  isActive: Joi.boolean().optional(),
});

const updateSubject = Joi.object({
  name: Joi.string().trim().optional(),
  classType: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createSubject,
  updateSubject,
};
