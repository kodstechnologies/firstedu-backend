import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const createChallenge = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  testId: objectId.required(),
  isFriendGroup: Joi.boolean().default(false).optional(),
  invitedFriends: Joi.array().items(objectId).optional(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
});

const updateChallenge = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  startTime: Joi.date().optional(),
  endTime: Joi.date().optional(),
  isActive: Joi.boolean().optional(),
});

const inviteFriendsToChallenge = Joi.object({
  friendIds: Joi.array().items(objectId).min(1).required(),
});

export default {
  createChallenge,
  updateChallenge,
  inviteFriendsToChallenge,
};

