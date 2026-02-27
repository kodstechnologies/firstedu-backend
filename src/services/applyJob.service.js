import applyJobRepository from "../repository/applyJob.repository.js";
import ApiError from "../utils/ApiError.js";

const createJob = async (data, adminId) => {
  return await applyJobRepository.create({
    ...data,
    createdBy: adminId,
  });
};

const getAllJobsPaginated = async (filters = {}, options = {}) => {
  return await applyJobRepository.findAllPaginated(filters, options);
};

const getJobById = async (id) => {
  const job = await applyJobRepository.findById(id);
  if (!job) {
    throw new ApiError(404, "Job not found");
  }
  return job;
};

const updateJob = async (id, data) => {
  const job = await applyJobRepository.findById(id);
  if (!job) {
    throw new ApiError(404, "Job not found");
  }
  return await applyJobRepository.updateById(id, data);
};

const deleteJob = async (id) => {
  const job = await applyJobRepository.findById(id);
  if (!job) {
    throw new ApiError(404, "Job not found");
  }
  return await applyJobRepository.deleteById(id);
};

export default {
  createJob,
  getAllJobsPaginated,
  getJobById,
  updateJob,
  deleteJob,
};
