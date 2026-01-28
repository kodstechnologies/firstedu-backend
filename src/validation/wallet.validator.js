import Joi from "joi";

const rechargeWallet = Joi.object({
  amount: Joi.number().positive().required(),
  paymentId: Joi.string().trim().optional(),
});

export default {
  rechargeWallet,
};

