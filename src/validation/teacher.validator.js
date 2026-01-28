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

export default {
  teacherSignup,
  teacherLogin,
  requestPasswordChange,
  verifyPasswordChange,
  confirmNewPassword,
  changePassword,
};

