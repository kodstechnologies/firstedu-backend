import Joi from "joi";

// Recursive schema: each category can have optional nested children (unlimited depth)
// Joi 17+ uses link() + id() instead of lazy() for self-referencing schemas
const createCategorySchema = Joi.object({
  name: Joi.string().required().trim(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
  children: Joi.array()
    .items(Joi.link("#category"))
    .optional(),
}).id("category");

const createCategory = createCategorySchema;

const updateCategory = Joi.object({
  name: Joi.string().trim().optional(),
  parent: Joi.string().optional().allow(null, ""),
  order: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export default {
  createCategory,
  updateCategory,
};
