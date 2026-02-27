import QnA from "../models/QnA.js";

const create = async (data) => {
  return await QnA.create(data);
};

const findAll = async (filters = {}) => {
  const query = {};
  if (filters.subject) {
    query.subject = filters.subject;
  }
  return await QnA.find(query).sort({ createdAt: -1 }).lean();
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const query = {};
  if (filters.subject) {
    query.subject = filters.subject;
  }
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    QnA.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    QnA.countDocuments(query),
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
  return await QnA.findById(id);
};

const updateById = async (id, updateData) => {
  return await QnA.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = async (id) => {
  return await QnA.findByIdAndDelete(id);
};

export default {
  create,
  findAll,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
};
