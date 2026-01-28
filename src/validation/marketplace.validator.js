import Joi from "joi";

const purchaseCourse = Joi.object({
  paymentId: Joi.string().trim().optional(),
});

const purchaseTest = Joi.object({
  paymentId: Joi.string().trim().optional(),
});

const purchaseTestBundle = Joi.object({
  paymentId: Joi.string().trim().optional(),
});

export default {
  purchaseCourse,
  purchaseTest,
  purchaseTestBundle,
};

