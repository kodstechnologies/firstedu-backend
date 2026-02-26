import ApplyJob from "../models/ApplyJob.js";

const create = async (data) => {
  return await ApplyJob.create(data);
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, hiringFor } = options;
  const matchQuery = {};
  if (filters.hiringFor) matchQuery.hiringFor = filters.hiringFor;
  if (hiringFor) matchQuery.hiringFor = hiringFor;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [aggregateResult, total] = await Promise.all([
    ApplyJob.aggregate([
      { $match: Object.keys(matchQuery).length ? matchQuery : {} },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: "jobapplications",
          localField: "_id",
          foreignField: "job",
          as: "applications",
        },
      },
      {
        $addFields: {
          appliedCount: { $size: "$applications" },
        },
      },
      { $project: { applications: 0 } },
    ]),
    ApplyJob.countDocuments(Object.keys(matchQuery).length ? matchQuery : {}),
  ]);

  return {
    list: aggregateResult,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
};

const findById = async (id) => {
  return await ApplyJob.findById(id);
};

const updateById = async (id, updateData) => {
  return await ApplyJob.findByIdAndUpdate(id, updateData, { new: true });
};

const deleteById = async (id) => {
  return await ApplyJob.findByIdAndDelete(id);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
};
