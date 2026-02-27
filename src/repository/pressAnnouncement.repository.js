import PressAnnouncement from "../models/PressAnnouncement.js";
import { PRESS_ANNOUNCEMENT_TYPES } from "../models/PressAnnouncement.js";

const create = async (data) => {
  return await PressAnnouncement.create(data);
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const query = {};
  if (filters.pressname) {
    query.pressname = new RegExp(filters.pressname, "i");
  }
  // type: filter by type; "allnews" = show all (no type filter)
  if (filters.type && filters.type !== "allnews" && PRESS_ANNOUNCEMENT_TYPES.includes(filters.type)) {
    query.type = filters.type;
  }
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    PressAnnouncement.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    PressAnnouncement.countDocuments(query),
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

const findById = async (id) => {
  return await PressAnnouncement.findById(id);
};

const updateById = async (id, updateData) => {
  return await PressAnnouncement.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = async (id) => {
  return await PressAnnouncement.findByIdAndDelete(id);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
};
