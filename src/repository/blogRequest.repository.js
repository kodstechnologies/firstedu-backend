// ==================== BLOG REQUEST REPOSITORY ====================

import BlogRequest from "../models/BlogRequest.js";

const escapeRegex = (value = "") =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new blog request
 */
const createBlogRequest = async (data) => {
    return await BlogRequest.create(data);
};

/**
 * Find blog requests with optional filters
 */
const findBlogRequests = async (filters = {}, options = {}) => {
    const { page = 1, limit = 10, search } = options;
    const query = {};

    if (filters.status) {
        query.status = filters.status;
    }

    const searchText = typeof search === "string" ? search.trim() : "";
    if (searchText) {
        const regex = { $regex: escapeRegex(searchText), $options: "i" };
        query.$or = [
            { name: regex },
            { email: regex },
            { title: regex },
            { description: regex },
            { subject: regex },
        ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [list, total] = await Promise.all([
        BlogRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
        BlogRequest.countDocuments(query),
    ]);

    return {
        list,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1,
        },
    };
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
