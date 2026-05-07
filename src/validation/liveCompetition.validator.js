import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// ─── Admin ─────────────────────────────────────────────────────────────────

const submissionConfigSchema = Joi.object({
  // type is optional — always overridden by category.submissionType in service layer
  type: Joi.string().valid("TEXT", "FILE").optional(),
  mode: Joi.string().valid("LIVE", "UPLOAD").default("UPLOAD"),
  text: Joi.object({
    limit:     Joi.number().integer().min(1).optional(),
    limitType: Joi.string().valid("WORDS", "CHARACTERS").default("WORDS"),
    topic:     Joi.string().trim().optional(),
    rules:     Joi.array().items(Joi.string().trim()).optional(),
    walletPoints: Joi.number().min(0).default(0).optional(),
  }).optional(),
  duration:        Joi.number().integer().min(1).optional().allow(null),
  autoGeneratePdf: Joi.boolean().default(false),
  file: Joi.object({
    allowedTypes: Joi.array().items(Joi.string()).optional(),
    maxSize:      Joi.number().min(0).optional(),
    maxFiles:     Joi.number().integer().min(1).default(1),
    instructions: Joi.array().items(Joi.string().trim()).optional(),
    walletPoints: Joi.number().min(0).default(0).optional(),
  }).optional(),
});

const createEvent = Joi.object({
  title:       Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  // category is required — service uses it to resolve submission.type
  category: objectId.required(),
  registration: Joi.object({
    start: Joi.date().required(),
    end:   Joi.date().required(),
  }).required(),
  eventWindow: Joi.object({
    start: Joi.date().required(),
    end:   Joi.date().required(),
  }).required(),
  // submission.type is optional here — service always overrides from category.submissionType
  submission: submissionConfigSchema.optional(),
  fee: Joi.object({
    amount:   Joi.number().min(0).default(0),
    currency: Joi.string().default("INR"),
    isPaid:   Joi.boolean().default(false),
  }).optional(),
  isPublished: Joi.boolean().default(false),
  // NOTE: status is NOT accepted — auto-computed from dates in the service
});

const updateEvent = Joi.object({
  title:       Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  category:    objectId.optional(),
  registration: Joi.object({
    start: Joi.date().optional(),
    end:   Joi.date().optional(),
  }).optional(),
  eventWindow: Joi.object({
    start: Joi.date().optional(),
    end:   Joi.date().optional(),
  }).optional(),
  submission: Joi.object({
    type: Joi.string().valid("TEXT", "FILE").optional(), // MULTIPLE removed
    mode: Joi.string().valid("LIVE", "UPLOAD").optional(),
    text: Joi.object({
      limit:     Joi.number().integer().min(1).optional(),
      limitType: Joi.string().valid("WORDS", "CHARACTERS").optional(),
      topic:     Joi.string().trim().optional(),
      rules:     Joi.array().items(Joi.string().trim()).optional(),
      walletPoints: Joi.number().min(0).optional(),
    }).optional(),
    duration:        Joi.number().integer().min(1).optional().allow(null),
    autoGeneratePdf: Joi.boolean().optional(),
    file: Joi.object({
      allowedTypes: Joi.array().items(Joi.string()).optional(),
      maxSize:      Joi.number().min(0).optional(),
      maxFiles:     Joi.number().integer().min(1).optional(),
      instructions: Joi.array().items(Joi.string().trim()).optional(),
      walletPoints: Joi.number().min(0).optional(),
    }).optional(),
  }).optional(),
  fee: Joi.object({
    amount:   Joi.number().min(0).optional(),
    currency: Joi.string().optional(),
    isPaid:   Joi.boolean().optional(),
  }).optional(),
  isPublished: Joi.boolean().optional(),
  // Only RESULT_DECLARED can be set manually; all other statuses are auto-computed
  status: Joi.string().valid("RESULT_DECLARED").optional(),
});

const reviewSubmission = Joi.object({
  isChecked: Joi.boolean().required(),
});

const declareWinner = Joi.object({
  winnerId: objectId.allow(null, "").optional(),
});

// ─── Student ─────────────────────────────────────────────────────────────────

const initiateLiveCompPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().allow("", null).optional(),
});

const completeLiveCompPayment = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const submitWork = Joi.object({
  text: Joi.string().trim().allow("", null).optional(),
});

const saveDraft = Joi.object({
  text: Joi.string().trim().allow("", null).optional(),
});

export default {
  createEvent,
  updateEvent,
  reviewSubmission,
  declareWinner,
  initiateLiveCompPayment,
  completeLiveCompPayment,
  submitWork,
  saveDraft,
};
