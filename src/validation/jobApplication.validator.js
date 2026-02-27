import Joi from "joi";

const applyForJob = Joi.object({
  jobId: Joi.string().trim().required().messages({
    "string.empty": "Job ID is required",
    "any.required": "Job ID is required",
  }),
  name: Joi.string().trim().required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  email: Joi.string().email().trim().lowercase().required().messages({
    "string.empty": "Email is required",
    "string.email": "Email must be valid",
    "any.required": "Email is required",
  }),
  phone: Joi.string().trim().required().messages({
    "string.empty": "Phone is required",
    "any.required": "Phone is required",
  }),
});

const scheduleInterview = Joi.object({
  interviewDate: Joi.date().required().messages({
    "date.base": "Interview date is required",
    "any.required": "Interview date is required",
  }),
  interviewTime: Joi.string().trim().required().messages({
    "string.empty": "Interview time is required",
    "any.required": "Interview time is required",
  }),
  interviewProvider: Joi.string().trim().required().messages({
    "string.empty": "Interview provider (e.g. Zoom, Meet) is required",
    "any.required": "Interview provider is required",
  }),
  providerLink: Joi.string().trim().allow("").optional(),
});

export default { applyForJob, scheduleInterview };
