import Joi from "joi";

// For student signup
const studentSignup = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  schoolOrCollege: Joi.string().trim().required(),
  classOrGrade: Joi.string().trim().required(),
  phone: Joi.string().required(),
  referralCode: Joi.string().optional(),
});

// For student login
const studentLogin = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  fcmToken: Joi.string().trim().allow("").optional(),
  forceLogin: Joi.boolean().optional(),
  deviceId: Joi.string().trim().allow("").optional(),
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
  email: Joi.string().email().trim().lowercase().optional().empty("", null),
  name: Joi.string().trim().optional().empty("", null),
  schoolOrCollege: Joi.string().trim().optional().empty("", null),
  classOrGrade: Joi.string().trim().optional().empty("", null),
  phone: Joi.string().trim().optional().empty("", null),
});

const changePassword = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
});

const contactUs = Joi.object({
  name: Joi.string().trim().required(),
  phone: Joi.string().trim().allow("").optional(),
  email: Joi.string().email().trim().lowercase().required(),
  message: Joi.string().trim().required(),
});

export default {
  studentSignup,
  studentLogin,
  requestPasswordChange,
  verifyPasswordChange,
  confirmNewPassword,
  updateProfile,
  changePassword,
  contactUs,
};
