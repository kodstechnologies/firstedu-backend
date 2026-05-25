import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const moduleSchema = Joi.object({
  _id: objectId.optional(),
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  test: objectId.required(),
  existingContents: Joi.array()
    .items(
      Joi.object({
        url: Joi.string().trim().required(),
        type: Joi.string().valid("pdf", "video", "audio").required(),
        originalName: Joi.string().trim().allow("", null).optional(),
      }).unknown(true)
    )
    .optional(),
}).unknown(true);

const createCourse = Joi.object({
  title: Joi.string().trim().required().messages({
    "string.base": "Title must be a string",
    "string.empty": "Title cannot be empty",
    "any.required": "Title is required",
  }),
  description: Joi.string().trim().allow("", null),
  syllabus: Joi.alternatives()
    .try(Joi.array().items(Joi.string().trim()), Joi.string().allow("", null))
    .optional(),
  modules: Joi.alternatives()
    .try(Joi.array().items(moduleSchema), Joi.string().allow("", null))
    .optional(),
  price: Joi.number().min(0).default(0),
  isPublished: Joi.boolean().optional(),
  isCertification: Joi.boolean().optional(),
  certificationTestIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
    .optional(),
  categoryIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
    .optional()
    .messages({
      "alternatives.match": "Invalid category",
    }),
});

const updateCourse = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  syllabus: Joi.alternatives()
    .try(Joi.array().items(Joi.string().trim()), Joi.string().allow("", null))
    .optional(),
  modules: Joi.alternatives()
    .try(Joi.array().items(moduleSchema), Joi.string().allow("", null))
    .optional(),
  price: Joi.number().min(0).optional(),
  isPublished: Joi.boolean().optional(),
  isCertification: Joi.boolean().optional(),
  certificationTestIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
    .optional(),
  categoryIds: Joi.alternatives()
    .try(Joi.array().items(objectId), objectId)
    .optional()
    .messages({
      "alternatives.match": "Invalid category",
    }),
});

export default {
  createCourse,
  updateCourse,
};
