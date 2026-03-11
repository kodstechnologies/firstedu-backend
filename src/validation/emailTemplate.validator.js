import Joi from "joi";

const createTemplate = Joi.object({
  category: Joi.string().trim().required(),
  slug: Joi.string().trim().required(),
  name: Joi.string().trim().required(),
  subject: Joi.string().trim().required(),
  content: Joi.string().allow("").required(),
});

const updateTemplate = Joi.object({
  name: Joi.string().trim().optional(),
  subject: Joi.string().trim().optional(),
  content: Joi.string().allow("").optional(),
}).min(1);

export default {
  createTemplate,
  updateTemplate,
};
