// ==================== BLOG REPOSITORY ====================

import Blog from "../models/Blog.js";

/**
 * Create a new blog
 */
const create = async (data) => {
  return await Blog.create(data);
};

/**
 * Find all published blogs (for students - no filter by status, all are published)
 */
const findAll = async (filters = {}) => {
  const query = {};
  if (filters.subject) {
    query.subject = new RegExp(filters.subject, "i");
  }
  if (filters.source) {
    query.source = filters.source;
  }
  return await Blog.find(query).sort({ createdAt: -1 }).lean();
};

/**
 * Find blog by ID
 */
const findById = async (id) => {
  return await Blog.findById(id);
};

/**
 * Update blog by ID
 */
const updateById = async (id, updateData) => {
  return await Blog.findByIdAndUpdate(id, updateData, { new: true });
};

/**
 * Delete blog by ID
 */
const deleteById = async (id) => {
  return await Blog.findByIdAndDelete(id);
};

export default {
  create,
  findAll,
  findById,
  updateById,
  deleteById,
};
