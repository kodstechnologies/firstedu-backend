import Joi from "joi";

const login = Joi.object({
  email: Joi.string().email().trim().required(),
  password: Joi.string().min(6).required(),
});

const requestForgotPasswordOTP = Joi.object({
  email: Joi.string().email().trim().required(),
});

const verifyForgotPasswordOTP = Joi.object({
  email: Joi.string().email().trim().required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

const resetPassword = Joi.object({
  email: Joi.string().email().trim().required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

const changePassword = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

export default {
  login,
  requestForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetPassword,
  changePassword,
};

