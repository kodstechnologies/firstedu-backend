import carearRepository from "../repository/carear.repository.js";
import { ApiError } from "../utils/ApiError.js";

const createJob = async (jobData) => {
  return await carearRepository.create(jobData);
};

const updateJob = async (jobId, updateData) => {
  const job = await carearRepository.updateById(jobId, updateData);
  if (!job) {
    throw new ApiError(404, "Carear job not found");
  }
  return job;
};

const deleteJob = async (jobId) => {
  const job = await carearRepository.deleteById(jobId);
  if (!job) {
    throw new ApiError(404, "Carear job not found");
  }
  return job;
};

const getAllJobs = async (filters = {}, page = 1, limit = 10) => {
  const { search, category, type, mode, location, company } = filters;

  const repoFilters = {};
  if (category) repoFilters.category = category;
  if (type) repoFilters.type = type;
  if (mode) repoFilters.mode = mode;
  if (location) repoFilters.location = { $regex: location, $options: "i" };
  if (company) repoFilters.company = { $regex: company, $options: "i" };

  const { list, pagination } = await carearRepository.findAllPaginated(repoFilters, {
    page,
    limit,
    search,
  });

  return { jobs: list, total: pagination.total };
};

const getJobById = async (jobId) => {
  const job = await carearRepository.findById(jobId);
  if (!job) {
    throw new ApiError(404, "Carear job not found");
  }
  return job;
};

export default {
  createJob,
  updateJob,
  deleteJob,
  getAllJobs,
  getJobById,
};
