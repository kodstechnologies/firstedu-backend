import Joi from "joi";

// ==================== BLOG REQUEST VALIDATORS ====================

const submitBlogRequest = Joi.object({
    name: Joi.string().trim().required().messages({
        "string.empty": "Name is required",
        "any.required": "Name is required",
    }),
    email: Joi.string().email().trim().required().messages({
        "string.empty": "Email is required",
        "string.email": "Email must be a valid email address",
        "any.required": "Email is required",
    }),
    role: Joi.string().valid("student", "teacher").required().messages({
        "any.only": "Role must be either student or teacher",
        "any.required": "Role is required",
    }),
    title: Joi.string().trim().required().messages({
        "string.empty": "Blog title is required",
        "any.required": "Blog title is required",
    }),
    description: Joi.string().trim().required().messages({
        "string.empty": "Blog description is required",
        "any.required": "Blog description is required",
    }),
});

const updateBlogRequestStatus = Joi.object({
    status: Joi.string().valid("approved", "rejected").required().messages({
        "any.only": "Status must be either approved or rejected",
        "any.required": "Status is required",
    }),
    adminComment: Joi.string().trim().optional().allow("").messages({
        "string.base": "Admin comment must be a string",
    }),
});

export default {
    submitBlogRequest,
    updateBlogRequestStatus,
};
