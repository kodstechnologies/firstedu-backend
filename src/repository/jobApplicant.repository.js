
import Carear from "../models/Carear.js";
import JobApplicant from "../models/JobApplicant.js";

const create = async (data) => {
  return await JobApplicant.create(data);
};

const updateApplicantCount=async (jobId) => {
    return await Carear.findByIdAndUpdate(jobId,{$inc:{applicantCount:1}})
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, search, jobId } = options;
  const matchQuery = { ...filters };

  if (jobId) matchQuery.jobId = jobId;

  if (search) {
    const regex = { $regex: search, $options: "i" };
    matchQuery.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { location: regex },
      { currentRole: regex },
      { experience: regex },
      { highestQualification: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    JobApplicant.find(matchQuery)
      .populate("jobId", "title company")
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    JobApplicant.countDocuments(matchQuery),
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
  return await JobApplicant.findById(id).populate("jobId", "title company");
};

const updateById = async (id, updateData) => {
  return await JobApplicant.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
};

const deleteById = async (id) => {
  return await JobApplicant.findByIdAndDelete(id);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
  updateApplicantCount
};
