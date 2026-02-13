import Joi from "joi";

const subCategorySchema = Joi.object({
  name: Joi.string().required().trim(),
  options: Joi.array().items(Joi.string().trim()).min(1).required(),
});

const createCategory = Joi.object({
  name: Joi.string().required().trim(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
});

const createCategoryWithSubcategories = Joi.object({
  name: Joi.string().required().trim(),
  subCategories: Joi.array().items(subCategorySchema).min(1).required(),
});

const updateCategory = Joi.object({
  name: Joi.string().trim().optional(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createCategory,
  createCategoryWithSubcategories,
  updateCategory,
};
