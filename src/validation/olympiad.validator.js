import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createOlympiad = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  rules: Joi.string().trim().allow("", null).optional(),
  testId: Joi.alternatives().try(objectId, Joi.string().required()).required(),
  registrationStartTime: Joi.date().required(),
  registrationEndTime: Joi.date().required(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  isPublished: Joi.boolean().optional(),
});

const updateOlympiad = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  rules: Joi.string().trim().allow("", null).optional(),
  testId: Joi.alternatives().try(objectId, Joi.string()).optional(),
  registrationStartTime: Joi.date().optional(),
  registrationEndTime: Joi.date().optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
  isPublished: Joi.boolean().optional(),
});

const registerForOlympiad = Joi.object({
  paymentId: Joi.string().trim().optional(),
});

export default {
  createOlympiad,
  updateOlympiad,
  registerForOlympiad,
};

