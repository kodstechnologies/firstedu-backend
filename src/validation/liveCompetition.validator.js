import Joi from "joi";

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// ─── Reusable Sub-Schemas ──────────────────────────────────────────────────

const submissionConfigSchema = Joi.object({
  // type is optional — always overridden by category.submissionType in service layer
  type: Joi.string().valid("TEXT", "FILE").optional(),
  text: Joi.object({
    limit: Joi.number().integer().min(1).optional(),
    limitType: Joi.string().valid("WORDS", "CHARACTERS").default("WORDS"),
    topic: Joi.string().trim().optional(),
    rules: Joi.array().items(Joi.string().trim()).optional(),
    walletPoints: Joi.number().min(0).default(0).optional(),
  }).optional(),
  duration: Joi.number().integer().min(1).optional().allow(null),
  autoGeneratePdf: Joi.boolean().default(false),
  file: Joi.object({
    allowedTypes: Joi.array().items(Joi.string()).optional(),
    maxSize: Joi.number().min(0).optional(),
    maxFiles: Joi.number().integer().min(1).default(1),
    instructions: Joi.array().items(Joi.string().trim()).optional(),
    walletPoints: Joi.number().min(0).default(0).optional(),
  }).optional(),
});

const feeSchema = Joi.object({
  amount: Joi.number().min(0).default(0),
  currency: Joi.string().default("INR"),
  isPaid: Joi.boolean().default(false),
});

const prizeSchema = Joi.object({
  rank: Joi.number().valid(1, 2, 3).required(),
  walletPoints: Joi.number().min(0).default(0),
  description: Joi.string().trim().optional(),
});

const megaAuditionCreateSchema = Joi.object({
  registration: Joi.object({
    start: Joi.date().required(),
    end: Joi.date().required(),
  }).required(),
  eventWindow: Joi.object({
    start: Joi.date().required(),
    end: Joi.date().required(),
  }).required(),
  resultDeclarationDate: Joi.date().optional(),
  maxQualifiers: Joi.number().integer().min(0).default(0),
  submission: submissionConfigSchema.optional(),
  fee: feeSchema.optional(),
});

const grandFinaleCreateSchema = Joi.object({
  paymentWindow: Joi.object({
    start: Joi.date().required(),
    end: Joi.date().required(),
  }).required(),
  eventWindow: Joi.object({
    start: Joi.date().required(),
    end: Joi.date().required(),
  }).required(),
  resultDeclarationDate: Joi.date().optional(),
  submission: submissionConfigSchema.optional(),
  fee: feeSchema.optional(),
  prizes: Joi.array().items(prizeSchema).max(3).optional(),
});

// ─── Admin Validators ──────────────────────────────────────────────────────

const createEvent = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().allow("", null).optional(),
  category: objectId.required(),
  isPublished: Joi.boolean().default(false),
  megaAudition: megaAuditionCreateSchema.required(),
  grandFinale: grandFinaleCreateSchema.required(),
});

const updateEvent = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().allow("", null).optional(),
  category: objectId.optional(),
  isPublished: Joi.boolean().optional(),

  megaAudition: Joi.object({
    registration: Joi.object({
      start: Joi.date().optional(),
      end: Joi.date().optional(),
    }).optional(),
    eventWindow: Joi.object({
      start: Joi.date().optional(),
      end: Joi.date().optional(),
    }).optional(),
    resultDeclarationDate: Joi.date().optional(),
    maxQualifiers: Joi.number().integer().min(0).optional(),
    submission: submissionConfigSchema.optional(),
    fee: feeSchema.optional(),
  }).optional(),

  grandFinale: Joi.object({
    paymentWindow: Joi.object({
      start: Joi.date().optional(),
      end: Joi.date().optional(),
    }).optional(),
    eventWindow: Joi.object({
      start: Joi.date().optional(),
      end: Joi.date().optional(),
    }).optional(),
    resultDeclarationDate: Joi.date().optional(),
    submission: submissionConfigSchema.optional(),
    fee: feeSchema.optional(),
    prizes: Joi.array().items(prizeSchema).max(3).optional(),
  }).optional(),
});

const reviewSubmission = Joi.object({
  isChecked: Joi.boolean().required(),
});

/**
 * Qualify a batch of Mega Audition submissions for the Grand Finale.
 */
const qualifyStudents = Joi.object({
  submissionIds: Joi.array().items(objectId).min(1).required(),
});

/**
 * Declare result for a specific round.
 */
const declareResult = Joi.object({
  round: Joi.string().valid("MEGA_AUDITION", "GRAND_FINALE").required(),
});

/**
 * Declare winners for a specific round (1, 2, 3 rank IDs).
 * At minimum rank1Id is required.
 * For MEGA_AUDITION rounds, prizes are NOT credited — only for GRAND_FINALE.
 */
const declareWinner = Joi.object({
  round: Joi.string().valid("MEGA_AUDITION", "GRAND_FINALE").required(),
  rank1Id: objectId.allow(null, "").optional(),
  rank2Id: objectId.allow(null, "").optional(),
  rank3Id: objectId.allow(null, "").optional(),
});

// ─── Student Validators ────────────────────────────────────────────────────

const initiateLiveCompPayment = Joi.object({
  paymentMethod: Joi.string().valid("free", "wallet", "razorpay").required(),
  couponCode: Joi.string().trim().allow("", null).optional(),
  round: Joi.string().valid("MEGA_AUDITION", "GRAND_FINALE").default("MEGA_AUDITION"),
});

const completeLiveCompPayment = Joi.object({
  razorpayOrderId: Joi.string().trim().required(),
  razorpayPaymentId: Joi.string().trim().required(),
  razorpaySignature: Joi.string().trim().required(),
});

const submitWork = Joi.object({
  text: Joi.string().trim().allow("", null).optional(),
  round: Joi.string().valid("MEGA_AUDITION", "GRAND_FINALE").default("MEGA_AUDITION"),
});

const saveDraft = Joi.object({
  text: Joi.string().trim().allow("", null).optional(),
  round: Joi.string().valid("MEGA_AUDITION", "GRAND_FINALE").default("MEGA_AUDITION"),
});

export default {
  createEvent,
  updateEvent,
  reviewSubmission,
  qualifyStudents,
  declareResult,
  declareWinner,
  initiateLiveCompPayment,
  completeLiveCompPayment,
  submitWork,
  saveDraft,
};
