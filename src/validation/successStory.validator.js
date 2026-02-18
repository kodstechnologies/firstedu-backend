import Joi from "joi";

// ==================== SUCCESS STORY VALIDATORS ====================
const createSuccessStory = Joi.object({
    studentName: Joi.string().trim().required().messages({
        "string.empty": "Student name is required",
        "any.required": "Student name is required",
    }),

    rankTitle: Joi.string().trim().required().messages({
        "string.empty": "Rank title is required",
        "any.required": "Rank title is required",
    }),

    examCategory: Joi.string().trim().required().messages({
        "string.empty": "Exam category is required",
        "any.required": "Exam category is required",
    }),

    storyType: Joi.string().valid("VIDEO", "PHOTO").required().messages({
        "any.only": "Story type must be either VIDEO or PHOTO",
        "any.required": "Story type is required",
    }),

    description: Joi.string().trim().required().messages({
        "string.empty": "Description is required",
        "any.required": "Description is required",
    }),

    // ✅ NEW: Allow status
    status: Joi.string()
        .valid("DRAFT", "PUBLISHED")
        .optional()
        .messages({
            "any.only": "Status must be either DRAFT or PUBLISHED",
        }),

    // ✅ NEW: Allow isFeatured
    isFeatured: Joi.boolean().optional(),
});


const updateSuccessStory = Joi.object({
    studentName: Joi.string().trim().optional(),
    rankTitle: Joi.string().trim().optional(),
    examCategory: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
    isFeatured: Joi.boolean().optional(),
}).min(1).messages({
    "object.min": "At least one field must be provided for update",
});

const updateStatus = Joi.object({
    status: Joi.string().valid("DRAFT", "PUBLISHED").required().messages({
        "any.only": "Status must be either DRAFT or PUBLISHED",
        "any.required": "Status is required",
    }),
});

export default {
    createSuccessStory,
    updateSuccessStory,
    updateStatus,
};
