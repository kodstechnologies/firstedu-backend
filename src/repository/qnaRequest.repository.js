import QnARequest from "../models/QnARequest.js";

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const create = async (data) => {
  return await QnARequest.create(data);
};

const findAll = async (filters = {}, options = {}) => {
  const { page, limit, search } = options;
  const query = {};
  if (filters.subject) query.subject = filters.subject;
  if (filters.status) query.status = filters.status;
  if (filters.requestedBy) query.requestedBy = filters.requestedBy;

  const searchText = typeof search === "string" ? search.trim() : "";
  if (searchText) {
    const regex = { $regex: escapeRegex(searchText), $options: "i" };
    query.$or = [{ question: regex }, { subject: regex }];
  }

  const hasPagination = page !== undefined || limit !== undefined;
  if (!hasPagination) {
    return await QnARequest.find(query)
      .sort({ createdAt: -1 })
      .populate("requestedBy", "name email phone")
      .lean();
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    QnARequest.find(query)
      .sort({ createdAt: -1 })
      .populate("requestedBy", "name email phone")
      .skip(skip)
      .limit(limitNum)
      .lean(),
    QnARequest.countDocuments(query),
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
  return await QnARequest.findById(id).populate("requestedBy", "name email phone");
};

const updateById = async (id, updateData) => {
  return await QnARequest.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = async (id) => {
  return await QnARequest.findByIdAndDelete(id);
};

export default {
  create,
  findAll,
  findById,
  updateById,
  deleteById,
};
