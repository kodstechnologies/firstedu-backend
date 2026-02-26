import JobApplication from "../models/JobApplication.js";

const create = async (data) => {
  return await JobApplication.create(data);
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, jobId, status } = options;
  const query = { ...filters };
  if (jobId) query.job = jobId;
  if (status) query.status = status;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    JobApplication.find(query)
      .populate("job", "title skills experience hiringFor salary createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    JobApplication.countDocuments(query),
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
  return await JobApplication.findById(id).populate(
    "job",
    "title skills experience hiringFor salary createdAt"
  );
};

const updateById = async (id, updateData) => {
  return await JobApplication.findByIdAndUpdate(id, updateData, {
    new: true,
  }).populate("job", "title skills experience hiringFor salary createdAt");
};

const deleteById = async (id) => {
  return await JobApplication.findByIdAndDelete(id);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
};
