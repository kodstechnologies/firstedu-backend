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
 * List blogs with filters, optional full-text-style search, sorting, and pagination.
 * Used by GET /admin/blogs and GET /user/blogs (student).
 */
const findAll = async (filters = {}, options = {}) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    search,
  } = options;

  const andConditions = [];

  if (filters.subject) {
    andConditions.push({
      subject: new RegExp(escapeRegex(filters.subject), "i"),
    });
  }
  if (filters.source) {
    andConditions.push({ source: filters.source });
  }
  if (filters.title) {
    andConditions.push({
      title: new RegExp(escapeRegex(filters.title), "i"),
    });
  }

  const searchTrimmed =
    typeof search === "string" ? search.trim() : String(search || "").trim();
  if (searchTrimmed) {
    const safe = escapeRegex(searchTrimmed);
    andConditions.push({
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { subject: { $regex: safe, $options: "i" } },
        { authorName: { $regex: safe, $options: "i" } },
      ],
    });
  }

  const query =
    andConditions.length === 0
      ? {}
      : andConditions.length === 1
        ? andConditions[0]
        : { $and: andConditions };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const sortField = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt";
  const sortDir = sortOrder === "asc" ? 1 : -1;
  const sort = { [sortField]: sortDir };

  const [list, total] = await Promise.all([
    Blog.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
    Blog.countDocuments(query),
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
