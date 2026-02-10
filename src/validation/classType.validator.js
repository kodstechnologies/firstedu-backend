import Joi from "joi";

const createClassType = Joi.object({
  name: Joi.string().required().trim(),
  isActive: Joi.boolean().optional(),
});

const updateClassType = Joi.object({
  name: Joi.string().trim().optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createClassType,
  updateClassType,
};
