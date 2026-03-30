// ==================== BLOG REQUEST REPOSITORY ====================

import BlogRequest from "../models/BlogRequest.js";

/**
 * Create a new blog request
 */
const createBlogRequest = async (data) => {
    return await BlogRequest.create(data);
};

/**
 * Find blog requests with optional filters, pagination and search
 */
const findBlogRequests = async (filters = {}, page = 1, limit = 10) => {
    const query = {};

    if (filters.status) {
        query.status = filters.status;
    }

    if (filters.search) {
        query.$or = [
            { title: { $regex: filters.search, $options: "i" } },
            { name: { $regex: filters.search, $options: "i" } },
        ];
    }

    const skip = (page - 1) * limit;

    const [blogRequests, total] = await Promise.all([
        BlogRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        BlogRequest.countDocuments(query),
    ]);

    return { blogRequests, total };
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
