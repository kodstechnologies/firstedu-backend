// ==================== BLOG REPOSITORY ====================

import Blog from "../models/Blog.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "title",
  "description",
  "subject",
  "source",
  "authorName",
]);

/**
 * Create a new blog
 */
const create = async (data) => {
  return await Blog.create(data);
};

/**
 * Find all published blogs with optional filters, pagination and search
 */
const findAll = async (filters = {}, page = 1, limit = 10) => {
  const query = {};
   const andConditions = [];
  if (filters.subject) {
    andConditions.push({
      subject: new RegExp(escapeRegex(filters.subject), "i"),
    });
  }

  if (filters.source) {
    andConditions.push({ source: filters.source });
  }

  if (filters.search) {
    andConditions.push({
      $or: [
        { title: { $regex: filters.search, $options: "i" } },
        { authorName: { $regex: filters.search, $options: "i" } },
      ],
    });
  }
 // ✅ IMPORTANT FIX
  if (andConditions.length > 0) {
    query.$and = andConditions;
  }
  const skip = (page - 1) * limit;

  const [blogs, total] = await Promise.all([
    Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(query),
  ]);

  return { blogs, total };
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
