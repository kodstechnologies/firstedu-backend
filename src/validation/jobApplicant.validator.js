import Joi from "joi";

const updateApplicantStatus = Joi.object({
  status: Joi.string()
    .valid("applied", "review", "shortlisted", "interview", "rejected", "hired")
    .required()
    .messages({
      "string.empty": "Status is required.",
      "any.required": "Status is required.",
      "any.only":
        "Status must be one of: applied, review, shortlisted, interview, rejected, hired.",
    }),

  meeting_link: Joi.string().trim().uri().optional().messages({
    "string.uri": "Meeting link must be a valid URL.",
  }),

  date: Joi.date().iso().optional().messages({
    "date.format": "Interview date must be a valid ISO date (e.g. 2025-12-31).",
  }),

  time: Joi.string().trim().optional(),
});

const createJobApplicant = Joi.object({
  fullName: Joi.string().trim().required().messages({
    "string.empty": "Full name is required.",
    "any.required": "Full name is required.",
  }),

  email: Joi.string().trim().email().required().messages({
    "string.empty": "Email address is required.",
    "any.required": "Email address is required.",
    "string.email": "Please provide a valid email address.",
  }),

  phone: Joi.string().trim().required().messages({
    "string.empty": "Phone number is required.",
    "any.required": "Phone number is required.",
  }),

  jobId: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      "string.empty": "Job ID is required.",
      "any.required": "Job ID is required.",
      "string.pattern.base": "Invalid job ID format.",
    }),

  // Optional fields
  location: Joi.string().trim().allow("").optional(),

  resumeUrl: Joi.string().trim().allow("").optional(),

  experience: Joi.string().trim().allow("").optional(),

  currentRole: Joi.string().trim().allow("").optional(),

  highestQualification: Joi.string().trim().allow("").optional(),

  graduationYear: Joi.string().trim().allow("").optional(),

  expectedSalary: Joi.string().trim().allow("").optional(),

  noticePeriod: Joi.string().trim().allow("").optional(),
});

export default {
  updateApplicantStatus,
  createJobApplicant,
};
