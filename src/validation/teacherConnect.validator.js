import Joi from "joi";

const initiateCallRequest = Joi.object({
  subject: Joi.string().trim().optional().allow(""),
});

const acceptCallRequest = Joi.object({});

const rejectCallRequest = Joi.object({
  reason: Joi.string().trim().optional().allow(""),
});

const endCall = Joi.object({
  durationMinutes: Joi.number().positive().required(),
  recordingUrl: Joi.string().uri().trim().optional().allow(""),
  recordingSid: Joi.string().trim().optional().allow(""),
});

const updateTeacherProfile = Joi.object({
  skills: Joi.array().items(Joi.string().trim()).min(1).optional(),
  perMinuteRate: Joi.number().min(0).optional(),
});

const toggleAvailability = Joi.object({
  isLive: Joi.boolean().required(),
});

const startCall = Joi.object({
  twilioCallSid: Joi.string().trim().required(),
});

export default {
  initiateCallRequest,
  acceptCallRequest,
  rejectCallRequest,
  endCall,
  updateTeacherProfile,
  toggleAvailability,
  startCall,
};

