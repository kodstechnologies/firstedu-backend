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

// Teacher can update only: name, email, gender, about (profileImage via file)
const updateTeacherProfile = Joi.object({
  name: Joi.string().trim().optional(),
  email: Joi.string().email().trim().lowercase().optional(),
  gender: Joi.string().valid("male", "female", "other").optional(),
  about: Joi.string().trim().allow("", null).optional(),
  profileImage: Joi.any().optional(),
});

const toggleAvailability = Joi.object({
  isLive: Joi.boolean().required(),
});

const startCall = Joi.object({
  twilioCallSid: Joi.string().trim().required(),
});

const rateTeacher = Joi.object({
  rating: Joi.number().min(1).max(5).integer().required(),
});

const registerTeacherFcmToken = Joi.object({
  fcmToken: Joi.string().trim().required(),
});

export default {
  initiateCallRequest,
  acceptCallRequest,
  rejectCallRequest,
  endCall,
  updateTeacherProfile,
  toggleAvailability,
  startCall,
  rateTeacher,
  registerTeacherFcmToken,
};

