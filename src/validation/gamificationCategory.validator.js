import Joi from "joi";

const updateSubcategory = Joi.object({
  totalLevels: Joi.number().integer().min(0).optional(),
  levels: Joi.array().items(
    Joi.object({
      level: Joi.number().integer().min(1).required(),
    })
  ).optional(),
});

export default {
  updateSubcategory,
};
