import jobApplicantRepository from "../repository/jobApplicant.repository.js";
import { ApiError } from "../utils/ApiError.js";

const getApplicantsByJobId = async (jobId, filters = {}, page = 1, limit = 10) => {
  const { search, status, location, experience, highestQualification } = filters;

  const repoFilters = {};
  if (status) repoFilters.status = status;
  if (location) repoFilters.location = { $regex: location, $options: "i" };
  if (experience) repoFilters.experience = { $regex: experience, $options: "i" };
  if (highestQualification)
    repoFilters.highestQualification = { $regex: highestQualification, $options: "i" };

  const { list, pagination } = await jobApplicantRepository.findAllPaginated(repoFilters, {
    page,
    limit,
    search,
    jobId,
  });

  return { applicants: list, total: pagination.total };
};

const getApplicantById = async (applicantId) => {
  const applicant = await jobApplicantRepository.findById(applicantId);
  if (!applicant) {
    throw new ApiError(404, "Applicant not found");
  }
  return applicant;
};

const updateApplicantStatus = async (applicantId, updateBody) => {
  const { status, date, time, meeting_link } = updateBody;
  
  const updateData = { status };
  
  if (date || time || meeting_link) {
    updateData.interview_schedule = {
      date: date || null,
      time: time || "",
      meeting_link: meeting_link || "",
    };
  }

  const applicant = await jobApplicantRepository.updateById(applicantId, updateData);
  if (!applicant) {
    throw new ApiError(404, "Applicant not found");
  }
  return applicant;
};

const createJobApplicant = async (applicantData) => {
  return await jobApplicantRepository.create(applicantData);
};

const updateApplicantCount=async (jobId) => {
 return await jobApplicantRepository.updateApplicantCount(jobId)
}
export default {
  getApplicantsByJobId,
  getApplicantById,
  updateApplicantStatus,
  createJobApplicant,
  updateApplicantCount
};
