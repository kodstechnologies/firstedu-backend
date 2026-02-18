import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import contactSupportService from "../services/contactSupport.service.js";
import contactSupportValidator from "../validation/contactSupport.validator.js";

/**
 * Submit support message (for students and teachers)
 * POST /user/support or /teacher/support
 */
export const submitSupport = asyncHandler(async (req, res) => {
    const { error, value } = contactSupportValidator.submitSupportMessage.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const supportMessage = await contactSupportService.submitSupportMessage(value);

    return res
        .status(201)
        .json(ApiResponse.success(supportMessage, "Support request submitted successfully"));
});

/**
 * Get all support messages (admin)
 * GET /admin/support
 */
export const getAllSupport = asyncHandler(async (req, res) => {
    const { status } = req.query;

    const filters = {};
    if (status) {
        filters.status = status;
    }

    const supportMessages = await contactSupportService.getAllSupportMessages(filters);

    return res
        .status(200)
        .json(ApiResponse.success(supportMessages, "Support messages fetched successfully"));
});

/**
 * Reply to support message and mark as resolved (admin)
 * PATCH /admin/support/:id
 */
export const replyToSupport = asyncHandler(async (req, res) => {
    const { error, value } = contactSupportValidator.replyToSupportMessage.validate(req.body);

    if (error) {
        throw new ApiError(
            400,
            "Validation Error",
            error.details.map((x) => x.message)
        );
    }

    const { id } = req.params;
    const { adminReply } = value;

    const updatedMessage = await contactSupportService.replyAndResolve(id, adminReply);

    return res
        .status(200)
        .json(ApiResponse.success(updatedMessage, "Support message resolved successfully"));
});

export default {
    submitSupport,
    getAllSupport,
    replyToSupport,
};
