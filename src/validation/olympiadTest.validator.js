import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createOlympiadTest = Joi.object({
  categoryId: objectId.required(),
  testId: objectId.required(),
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
});

const updateOlympiadTest = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
});

export default {
  createOlympiadTest,
  updateOlympiadTest,
};
