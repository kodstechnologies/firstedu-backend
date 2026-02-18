import blogRequestRepository from "../repository/blogRequest.repository.js";
import ApiError from "../utils/ApiError.js";

/**
 * Submit blog request
 */
const submitBlogRequest = async (data) => {
    return await blogRequestRepository.createBlogRequest({
        ...data,
        status: "pending",
    });
};

/**
 * Get all blog requests (admin)
 */
const getAllBlogRequests = async (filters) => {
    return await blogRequestRepository.findBlogRequests(filters);
};

/**
 * Get blog request by ID (admin)
 */
const getBlogRequestById = async (id) => {
    const blogRequest = await blogRequestRepository.findById(id);

    if (!blogRequest) {
        throw new ApiError(404, "Blog request not found");
    }

    return blogRequest;
};

/**
 * Update blog request status (admin)
 */
const updateBlogRequestStatus = async (id, status, adminComment) => {
    const blogRequest = await blogRequestRepository.findById(id);

    if (!blogRequest) {
        throw new ApiError(404, "Blog request not found");
    }

    const updateData = {
        status,
    };

    if (adminComment) {
        updateData.adminComment = adminComment;
    }

    return await blogRequestRepository.updateById(id, updateData);
};

export default {
    submitBlogRequest,
    getAllBlogRequests,
    getBlogRequestById,
    updateBlogRequestStatus,
};
