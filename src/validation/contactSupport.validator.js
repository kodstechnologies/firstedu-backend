import Joi from "joi";

// ==================== SIMPLE SUPPORT MESSAGE VALIDATORS ====================

const submitSupportMessage = Joi.object({
  name: Joi.string().trim().required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().trim().required().messages({
    "string.empty": "Email is required",
    "string.email": "Email must be a valid email address",
    "any.required": "Email is required",
  }),
  role: Joi.string().valid("student", "teacher").required().messages({
    "any.only": "Role must be either student or teacher",
    "any.required": "Role is required",
  }),
  message: Joi.string().trim().required().messages({
    "string.empty": "Message is required",
    "any.required": "Message is required",
  }),
});

const replyToSupportMessage = Joi.object({
  adminReply: Joi.string().trim().required().messages({
    "string.empty": "Admin reply is required",
    "any.required": "Admin reply is required",
  }),
  status: Joi.string().valid("resolved").required().messages({
    "any.only": "Status must be resolved",
    "any.required": "Status is required",
  }),
});

export default {
 
  // Simple support message validators
  submitSupportMessage,
  replyToSupportMessage,
};
