import jobApplicationRepository from "../repository/jobApplication.repository.js";
import applyJobRepository from "../repository/applyJob.repository.js";
import ApiError from "../utils/ApiError.js";
import {
  sendInterviewScheduledEmail,
  sendTeacherApprovalConfirmationEmail,
  sendTeacherRejectionEmail,
} from "../utils/sendEmail.js";

const createApplication = async (data, resumeUrl) => {
  const job = await applyJobRepository.findById(data.jobId);
  if (!job) {
    throw new ApiError(404, "Job not found");
  }
  return await jobApplicationRepository.create({
    job: data.jobId,
    name: data.name,
    email: data.email,
    phone: data.phone,
    resume: resumeUrl,
  });
};

const getAllApplicationsPaginated = async (filters = {}, options = {}) => {
  return await jobApplicationRepository.findAllPaginated(filters, options);
};

const getApplicationById = async (id) => {
  const application = await jobApplicationRepository.findById(id);
  if (!application) {
    throw new ApiError(404, "Application not found");
  }
  return application;
};

const scheduleInterview = async (applicationId, data) => {
  const application = await jobApplicationRepository.findById(applicationId);
  if (!application) {
    throw new ApiError(404, "Application not found");
  }
  if (application.status === "approved" || application.status === "rejected") {
    throw new ApiError(400, "Cannot schedule interview for approved or rejected application");
  }

  const updated = await jobApplicationRepository.updateById(applicationId, {
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewProvider: data.interviewProvider,
    providerLink: data.providerLink,
    status: "interview_scheduled",
  });

  const jobTitle = application.job?.title || "Teacher Position";
  await sendInterviewScheduledEmail({
    toEmail: application.email,
    teacherName: application.name,
    jobTitle,
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewProvider: data.interviewProvider,
    providerLink: data.providerLink,
  });

  return updated;
};

const approveApplication = async (applicationId) => {
  const application = await jobApplicationRepository.findById(applicationId);
  if (!application) {
    throw new ApiError(404, "Application not found");
  }
  if (application.status === "approved") {
    throw new ApiError(400, "Application is already approved");
  }
  if (application.status === "rejected") {
    throw new ApiError(400, "Cannot approve a rejected application");
  }

  const jobTitle = application.job?.title || "Teacher Position";
  await sendTeacherApprovalConfirmationEmail({
    toEmail: application.email,
    teacherName: application.name,
    jobTitle,
  });

  return await jobApplicationRepository.updateById(applicationId, { status: "approved" });
};

const rejectApplication = async (applicationId) => {
  const application = await jobApplicationRepository.findById(applicationId);
  if (!application) {
    throw new ApiError(404, "Application not found");
  }

  const jobTitle = application.job?.title || "Teacher Position";
  await sendTeacherRejectionEmail({
    toEmail: application.email,
    teacherName: application.name,
    jobTitle,
  });

  await jobApplicationRepository.deleteById(applicationId);
  return null;
};

export default {
  createApplication,
  getAllApplicationsPaginated,
  getApplicationById,
  scheduleInterview,
  approveApplication,
  rejectApplication,
};
