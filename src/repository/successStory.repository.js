// ==================== SUCCESS STORY REPOSITORY ====================

import SuccessStory from "../models/SuccessStory.js";

/**
 * Create a new success story
 */
const createSuccessStory = async (data) => {
    return await SuccessStory.create(data);
};

/**
 * Find success stories with optional filters
 */
const findSuccessStories = async (filters = {}) => {
    const query = {};

    if (filters.status) {
        query.status = filters.status;
    }

    if (filters.examCategory) {
        query.examCategory = filters.examCategory;
    }

    if (filters.isFeatured !== undefined) {
        query.isFeatured = filters.isFeatured;
    }

    return await SuccessStory.find(query)
        .sort({ createdAt: -1 })
        .populate("createdBy", "name email")
        .lean();
};

/**
 * Find success story by ID
 */
const findById = async (id) => {
    return await SuccessStory.findById(id).populate("createdBy", "name email");
};

/**
 * Update success story by ID
 */
const updateById = async (id, updateData) => {
    return await SuccessStory.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
    }).populate("createdBy", "name email");
};

/**
 * Delete success story by ID
 */
const deleteById = async (id) => {
    return await SuccessStory.findByIdAndDelete(id);
};

/**
 * Get featured published stories with limit
 */
const getFeaturedPublishedStories = async (limit = 3) => {
    return await SuccessStory.find({
        status: "PUBLISHED",
        isFeatured: true,
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

export default {
    createSuccessStory,
    findSuccessStories,
    findById,
    updateById,
    deleteById,
    getFeaturedPublishedStories,
};
