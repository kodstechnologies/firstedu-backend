// ==================== SUPPORT REPOSITORY ====================

import Support from "../models/ContactSupport.js";

/**
 * Create a new support message
 */
const createSupportMessage = async (data) => {
  return await Support.create(data);
};

/**
 * Find support messages with optional filters
 */
const findSupportMessages = async (filters = {}) => {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.role) {
    query.role = filters.role;
  }

  return await Support.find(query)
    .sort({ createdAt: -1 })
    .lean();
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
