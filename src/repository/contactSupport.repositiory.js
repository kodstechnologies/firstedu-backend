// ==================== SUPPORT REPOSITORY ====================

import Support from "../models/ContactSupport.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create a new support message
 */
const createSupportMessage = async (data) => {
  return await Support.create(data);
};

/**
 * Find support messages with optional filters
 */
const findSupportMessages = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, search } = options;
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.role) {
    query.role = filters.role;
  }

  const searchText = typeof search === "string" ? search.trim() : "";
  if (searchText) {
    const regex = { $regex: escapeRegex(searchText), $options: "i" };
    query.$or = [{ name: regex }, { email: regex }, { message: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    Support.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Support.countDocuments(query),
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
 * Find support message by ID
 */
const findById = async (id) => {
  return await Support.findById(id);
};

/**
 * Update support message by ID
 */
const updateById = async (id, updateData) => {
  return await Support.findByIdAndUpdate(id, updateData, {
    new: true,
  });
};

export default {
  createSupportMessage,
  findSupportMessages,
  findById,
  updateById,
};
