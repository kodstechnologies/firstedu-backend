// ==================== SUCCESS STORY REPOSITORY ====================

import SuccessStory from "../models/SuccessStory.js";

/**
 * Create a new success story
 */
const createSuccessStory = async (data) => {
  return await SuccessStory.create(data);
};

/**
 * Find success stories with optional filters, pagination and search
 */
const findSuccessStories = async (filters = {}, page = 1, limit = 10) => {
  const query = {};
  const { search } = filters;
  if (filters.status) {
    query.status = filters.status;
  }
  // Search by name(pressname)
  if (search) {
    query.$or = [
      { name: { $regex: filters.search, $options: "i" } },
      { achievement: { $regex: filters.search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
    ];
  }


  const skip = (page - 1) * limit;

  const [stories, total] = await Promise.all([
    SuccessStory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .lean(),
    SuccessStory.countDocuments(query),
  ]);

  return { stories, total };
};

/**
 * Find success story by ID
 */
const findById = async (id) => {
  return await SuccessStory.findById(id).populate("createdBy", "name email");
};

//  Update success story by ID
 
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
