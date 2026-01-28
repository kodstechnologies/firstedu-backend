import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

const getDetailedAnalysis = Joi.object({
  sessionId: objectId.required(),
});

const calculateAnalysis = Joi.object({
  sessionId: objectId.required(),
});

export default {
  getDetailedAnalysis,
  calculateAnalysis,
};

