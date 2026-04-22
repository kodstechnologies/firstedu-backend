import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createOlympiadTest = Joi.object({
  categoryId:            objectId.required(),
  testId:                objectId.required(),
  title:                 Joi.string().trim().required(),
  description:           Joi.string().trim().allow("", null).optional(),
  // Schedule — endTime is NOT accepted (computed server-side)
  registrationStartTime: Joi.date().allow(null).optional(),
  registrationEndTime:   Joi.date().allow(null).optional(),
  startTime:             Joi.date().allow(null).optional(),
  resultDeclarationDate: Joi.date().allow(null).optional(),
  // Prize points
  firstPlacePoints:      Joi.number().min(0).default(0).optional(),
  secondPlacePoints:     Joi.number().min(0).default(0).optional(),
  thirdPlacePoints:      Joi.number().min(0).default(0).optional(),
});

const updateOlympiadTest = Joi.object({
  title:                 Joi.string().trim().optional(),
  description:           Joi.string().trim().allow("", null).optional(),
  // Schedule — endTime is NOT accepted (re-computed server-side when startTime changes)
  registrationStartTime: Joi.date().allow(null).optional(),
  registrationEndTime:   Joi.date().allow(null).optional(),
  startTime:             Joi.date().allow(null).optional(),
  resultDeclarationDate: Joi.date().allow(null).optional(),
  // Prize points
  firstPlacePoints:      Joi.number().min(0).optional(),
  secondPlacePoints:     Joi.number().min(0).optional(),
  thirdPlacePoints:      Joi.number().min(0).optional(),
});

export default {
  createOlympiadTest,
  updateOlympiadTest,
};
