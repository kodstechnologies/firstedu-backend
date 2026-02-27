// ==================== BLOG REQUEST REPOSITORY ====================

import BlogRequest from "../models/BlogRequest.js";

/**
 * Create a new blog request
 */
const createBlogRequest = async (data) => {
    return await BlogRequest.create(data);
};

/**
 * Find blog requests with optional filters
 */
const findBlogRequests = async (filters = {}) => {
    const query = {};

    if (filters.status) {
        query.status = filters.status;
    }

    return await BlogRequest.find(query)
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Find blog request by ID
 */
const findById = async (id) => {
    return await BlogRequest.findById(id);
};

/**
 * Update blog request by ID
 */
const updateById = async (id, updateData) => {
    return await BlogRequest.findByIdAndUpdate(id, updateData, {
        new: true,
    });
};

/**
 * Delete blog request by ID
 */
const deleteById = async (id) => {
    return await BlogRequest.findByIdAndDelete(id);
};

export default {
    createBlogRequest,
    findBlogRequests,
    findById,
    updateById,
    deleteById,
};
