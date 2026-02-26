import Joi from "joi";

// ==================== BLOG REQUEST VALIDATORS ====================

const submitBlogRequest = Joi.object({
    title: Joi.string().trim().required().messages({
        "string.empty": "Blog title is required",
        "any.required": "Blog title is required",
    }),
    description: Joi.string().trim().required().messages({
        "string.empty": "Blog description is required",
        "any.required": "Blog description is required",
    }),
    subject: Joi.string().trim().required().messages({
        "string.empty": "Subject is required",
        "any.required": "Subject is required",
    }),
    keyTakeaways: Joi.array().items(Joi.string().trim()).default([]).messages({
        "array.base": "Key takeaways must be an array of strings",
    }),
});

const updateBlogRequestStatus = Joi.object({
    status: Joi.string().valid("approved", "rejected").required().messages({
        "any.only": "Status must be either approved or rejected",
        "any.required": "Status is required",
    }),
});

export default {
    submitBlogRequest,
    updateBlogRequestStatus,
};
