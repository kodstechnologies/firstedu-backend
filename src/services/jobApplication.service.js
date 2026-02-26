import jobApplicationRepository from "../repository/jobApplication.repository.js";
import applyJobRepository from "../repository/applyJob.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import ApiError from "../utils/ApiError.js";
import {
  sendInterviewScheduledEmail,
  sendTeacherApprovalWithCredentialsEmail,
  sendTeacherRejectionEmail,
} from "../utils/sendEmail.js";
import crypto from "crypto";

/**
 * Generate a random password (alphanumeric, 12 chars).
 */
function generateRandomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

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

  const existingTeacher = await teacherRepository.findOne({ email: application.email });
  if (existingTeacher) {
    throw new ApiError(409, "A teacher with this email already exists");
  }

  const password = generateRandomPassword();
  const job = application.job?.skills ? application.job : await applyJobRepository.findById(application.job);
  const skills = Array.isArray(job?.skills) ? job.skills : [];

  await teacherRepository.create({
    name: application.name,
    email: application.email,
    password,
    phone: application.phone,
    gender: "other",
    skills,
    status: "approved",
    resumeUrl: application.resume || null,
  });

  await sendTeacherApprovalWithCredentialsEmail({
    toEmail: application.email,
    teacherName: application.name,
    email: application.email,
    password,
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
