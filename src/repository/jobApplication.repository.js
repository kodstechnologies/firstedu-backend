import JobApplication from "../models/JobApplication.js";

const create = async (data) => {
  return await JobApplication.create(data);
};

const findAllPaginated = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10, jobId, status, search } = options;
  const query = { ...filters };
  if (jobId) query.job = jobId;
  if (status) query.status = status;

  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    JobApplication.find(query)
      .populate("job", "title skills experience hiringFor perMinuteRate language createdAt")
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
    "title skills experience hiringFor perMinuteRate language createdAt"
  );
};

const updateById = async (id, updateData) => {
  return await JobApplication.findByIdAndUpdate(id, updateData, {
    new: true,
  }).populate("job", "title skills experience hiringFor perMinuteRate language createdAt");
};

const deleteById = async (id) => {
  return await JobApplication.findByIdAndDelete(id);
};

/** Applications where interview was scheduled and the scheduled date+time has passed */
const getInterviewTakenQuery = () => {
  const now = new Date();
  return {
    status: "interview_scheduled",
    $or: [
      { interviewDateTime: { $lte: now } },
      { interviewDateTime: { $exists: false }, interviewDate: { $lte: now } },
      { interviewDateTime: null, interviewDate: { $lte: now } },
    ],
  };
};

const findInterviewTakenPaginated = async (options = {}) => {
  const { page = 1, limit = 10, jobId, search } = options;
  const query = getInterviewTakenQuery();
  if (jobId) query.job = jobId;
  if (search) {
    const regex = { $regex: search, $options: "i" };
    query.$and = query.$and || [];
    query.$and.push({ $or: [{ name: regex }, { email: regex }, { phone: regex }] });
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    JobApplication.find(query)
      .populate("job", "title skills experience hiringFor perMinuteRate language createdAt")
      .sort({ interviewDateTime: -1, interviewDate: -1 })
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

const countInterviewTaken = async (jobId = null) => {
  const query = getInterviewTakenQuery();
  if (jobId) query.job = jobId;
  return await JobApplication.countDocuments(query);
};

export default {
  create,
  findAllPaginated,
  findById,
  updateById,
  deleteById,
  findInterviewTakenPaginated,
  countInterviewTaken,
};
