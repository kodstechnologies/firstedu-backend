// ==================== SUCCESS STORY REPOSITORY ====================

import SuccessStory from "../models/SuccessStory.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new success story
 */
const createSuccessStory = async (data) => {
  return await SuccessStory.create(data);
};

/**
 * Find success stories with optional filters
 */
const findSuccessStories = async (filters = {}, options = {}) => {
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
      { description: regex },
      { achievement: regex },
      { achieveIn: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    SuccessStory.find(query)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SuccessStory.countDocuments(query),
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
 * Get published stories with limit (for featured / listing)
 */
const getFeaturedPublishedStories = async (limit = 3) => {
  return await SuccessStory.find({ status: "PUBLISHED" })
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
