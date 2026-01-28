import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const tournamentStageSchema = Joi.object({
  name: Joi.string().valid("Qualifier", "Semi-Final", "Final").required(),
  test: objectId.required(),
  subject: Joi.string().trim().optional(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  minimumMarksToQualify: Joi.number().min(0).default(0).optional(),
  maxParticipants: Joi.number().integer().min(1).optional().allow(null),
});

const createTournament = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  stages: Joi.array().items(tournamentStageSchema).min(1).required(),
  registrationStartTime: Joi.date().required(),
  registrationEndTime: Joi.date().required(),
  isPublished: Joi.boolean().optional(),
});

const updateTournament = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  stages: Joi.array().items(tournamentStageSchema).optional(),
  registrationStartTime: Joi.date().optional(),
  registrationEndTime: Joi.date().optional(),
  isPublished: Joi.boolean().optional(),
});

const registerForTournament = Joi.object({
  paymentId: Joi.string().trim().optional(),
});

export default {
  createTournament,
  updateTournament,
  registerForTournament,
};

