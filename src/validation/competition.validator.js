import Joi from 'joi';

// ── Reusable sub-schemas ───────────────────────────────────────────────────────

const heroSectionSchema = Joi.object({
    title: Joi.string().trim().allow('', null).optional(),
    subtitle: Joi.string().trim().allow('', null).optional(),
    description: Joi.string().trim().allow('', null).optional(),
});

const examInfoSchema = Joi.object({
    fullName: Joi.string().trim().allow('', null).optional(),
    examDate: Joi.date().allow(null).optional(),
    examTime: Joi.string().trim().allow('', null).optional(),
});

const noticeItemSchema = Joi.object({
    text: Joi.string().trim().required(),
    isLive: Joi.boolean().default(false).optional(),
});

// ── Create Competition ─────────────────────────────────────────────────────────

const createCompetition = Joi.object({
    label: Joi.string().trim().required(),
    slug: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9-]+$/)
        .optional()
        .messages({
            'string.pattern.base': 'Slug can only contain lowercase letters, digits, and hyphens',
        }),
    category: Joi.string().trim().allow('', null).optional(),
    icon: Joi.string().trim().allow('', null).optional(),
    test: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required()
        .messages({
            'string.pattern.base': 'test must be a valid MongoDB ObjectId',
            'any.required': 'test (exam reference) is required',
        }),
    status: Joi.string().valid('Active', 'Draft', 'Paused', 'Archived').default('Draft').optional(),

    heroSection: heroSectionSchema.optional(),
    examInfo: examInfoSchema.optional(),

    notices: Joi.array().items(noticeItemSchema).default([]).optional(),
});

// ── Update Competition (all fields optional) ───────────────────────────────────

const updateCompetition = Joi.object({
    label: Joi.string().trim().optional(),
    slug: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9-]+$/)
        .optional()
        .messages({
            'string.pattern.base': 'Slug can only contain lowercase letters, digits, and hyphens',
        }),
    category: Joi.string().trim().allow('', null).optional(),
    icon: Joi.string().trim().allow('', null).optional(),
    test: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .optional()
        .messages({
            'string.pattern.base': 'test must be a valid MongoDB ObjectId',
        }),
    status: Joi.string().valid('Active', 'Draft', 'Paused', 'Archived').optional(),

    heroSection: heroSectionSchema.optional(),
    examInfo: examInfoSchema.optional(),

    notices: Joi.array().items(noticeItemSchema).optional(),
}).min(1);

export default {
    createCompetition,
    updateCompetition,
};
