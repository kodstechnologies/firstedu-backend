import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createChallenge = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  testId: objectId.required(),
});

const updateChallenge = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  isActive: Joi.boolean().optional(),
});

const joinChallengeByCode = Joi.object({
  roomCode: Joi.string().trim().length(6).required(),
});

export default {
  createChallenge,
  updateChallenge,
  joinChallengeByCode,
};

