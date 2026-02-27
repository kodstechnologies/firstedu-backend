import QnARequest from "../models/QnARequest.js";

const create = async (data) => {
  return await QnARequest.create(data);
};

const findAll = async (filters = {}) => {
  const query = {};
  if (filters.subject) query.subject = filters.subject;
  if (filters.status) query.status = filters.status;
  if (filters.requestedBy) query.requestedBy = filters.requestedBy;
  return await QnARequest.find(query)
    .sort({ createdAt: -1 })
    .populate("requestedBy", "name email phone")
    .lean();
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
