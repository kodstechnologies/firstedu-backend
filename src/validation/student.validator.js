import Joi from "joi";

// For student signup
const studentSignup = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  occupation: Joi.string().required(),
  phone: Joi.string().required(),
});

// For student login
const studentLogin = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const requestPasswordChange = Joi.object({}); // no body needed

const verifyPasswordChange = Joi.object({
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

const confirmNewPassword = Joi.object({
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required(),
});

const updateProfile = Joi.object({
  email: Joi.string().email().trim().lowercase().optional(),
  name: Joi.string().trim().optional(),
  occupation: Joi.string().trim().optional(),
  phone: Joi.string().trim().optional(),
});

const changePassword = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

export default {
  studentSignup,
  studentLogin,
  requestPasswordChange,
  verifyPasswordChange,
  confirmNewPassword,
  updateProfile,
  changePassword,
};
