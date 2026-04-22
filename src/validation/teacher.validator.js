import Joi from "joi";

// Teacher signup
const teacherSignup = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().trim().required(),
  gender: Joi.string().valid("male", "female", "other").required(),
  skills: Joi.array().items(Joi.string().trim()).min(1).required(),
});

// Teacher login
const teacherLogin = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required(),
});

// Request password change OTP
const requestPasswordChange = Joi.object({}); // no body needed

// Verify password change OTP
const verifyPasswordChange = Joi.object({
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

// Confirm new password
const confirmNewPassword = Joi.object({
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

// Change password (when logged in)
const changePassword = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

// Admin create teacher (name, about, experience, salaryPerMinute, language, skills, hiringFor, email, gender, password)
const adminCreateTeacher = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().min(6).required(),
  gender: Joi.string().valid("male", "female", "other").required(),
  about: Joi.string().trim().allow("", null).optional(),
  experience: Joi.string().trim().allow("", null).optional(),
  language: Joi.string().trim().allow("", null).optional(),
  salaryPerMinute: Joi.number().min(0).optional(),
  skills: Joi.array().items(Joi.string().trim()).optional(),
});

// Admin update teacher (all optional)
const adminUpdateTeacher = Joi.object({
  name: Joi.string().trim().optional(),
  email: Joi.string().email().trim().lowercase().optional(),
  password: Joi.string().min(6).optional(),
  gender: Joi.string().valid("male", "female", "other").optional(),
  about: Joi.string().trim().allow("", null).optional(),
  experience: Joi.string().trim().allow("", null).optional(),
  language: Joi.string().trim().allow("", null).optional(),

  salaryPerMinute: Joi.number().min(0).optional(),
  skills: Joi.array().items(Joi.string().trim()).optional(),
});

// Teacher self-update profile (only name, email, gender, about; profileImage via file)
const teacherUpdateProfile = Joi.object({
  name: Joi.string().trim().optional(),
  email: Joi.string().email().trim().lowercase().optional(),
  gender: Joi.string().valid("male", "female", "other").optional(),
  about: Joi.string().trim().allow("", null).optional(),
});

// Admin send credentials – password to set and email to teacher
const sendCredentials = Joi.object({
  password: Joi.string().min(6).required(),
});

export default {
  teacherSignup,
  teacherLogin,
  requestPasswordChange,
  verifyPasswordChange,
  confirmNewPassword,
  changePassword,
  adminCreateTeacher,
  adminUpdateTeacher,
  teacherUpdateProfile,
  sendCredentials,
};

