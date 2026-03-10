import crypto from "crypto";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import jobApplicationRepository from "../repository/jobApplication.repository.js";
import applyJobRepository from "../repository/applyJob.repository.js";
import teacherRepository from "../repository/teacher.repository.js";
import ApiError from "../utils/ApiError.js";
import {
  sendInterviewScheduledEmail,
  sendTeacherApprovalWithCredentialsEmail,
  sendTeacherRejectionEmail,
} from "../utils/sendEmail.js";

dayjs.extend(customParseFormat);

/**
 * Parse interviewTime string (e.g. "2:00 PM", "10:00 AM", "14:00") and combine with interviewDate.
 * Returns Date or null if parse fails.
 */
const buildInterviewDateTime = (interviewDate, interviewTime) => {
  if (!interviewDate || !interviewTime) return null;
  const d = dayjs(interviewDate);
  if (!d.isValid()) return null;
  const timeStr = String(interviewTime).trim();
  let hour = 0;
  let minute = 0;

  const formats = [
    "h:mm A", "hh:mm A", "h:mm a", "hh:mm a",
    "h A", "hh A", "h a", "hh a",
    "HH:mm", "H:mm", "HH:mm:ss", "H:mm:ss",
  ];
  let parsed = dayjs(timeStr, formats, true);
  if (parsed.isValid()) {
    hour = parsed.hour();
    minute = parsed.minute();
  } else {
    const m = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
    if (m) {
      hour = parseInt(m[1], 10);
      minute = m[2] ? parseInt(m[2], 10) : 0;
      if ((m[3] || "").toLowerCase() === "pm" && hour < 12) hour += 12;
      if ((m[3] || "").toLowerCase() === "am" && hour === 12) hour = 0;
    } else {
      return null;
    }
  }
  return d.hour(hour).minute(minute).second(0).millisecond(0).toDate();
};

/** Generate a secure random password (12 chars, alphanumeric + special) */
const generateSecurePassword = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
  const bytes = crypto.randomBytes(12);
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
};

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
  const result = await jobApplicationRepository.findAllPaginated(filters, options);
  const [totalJobs, totalInterviewTaken] = await Promise.all([
    applyJobRepository.countAll(),
    jobApplicationRepository.countInterviewTaken(),
  ]);
  return {
    ...result,
    pagination: {
      ...result.pagination,
      totalJobs,
      totalInterviewTaken,
    },
  };
};

const getInterviewTakenPaginated = async (options = {}) => {
  return await jobApplicationRepository.findInterviewTakenPaginated(options);
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

  const interviewDateTime = buildInterviewDateTime(data.interviewDate, data.interviewTime);

  const updated = await jobApplicationRepository.updateById(applicationId, {
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewDateTime: interviewDateTime || undefined,
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

  const job = application.job;
  const generatedPassword = generateSecurePassword();

  const teacherData = {
    name: application.name,
    email: application.email,
    password: generatedPassword,
    gender: "other",
    phone: application.phone || null,
    about: null,
    experience: job?.experience || null,
    language: job?.language || null,
    hiringFor: job?.hiringFor || null,
    skills: Array.isArray(job?.skills) ? job.skills : [],
    perMinuteRate: job?.perMinuteRate ?? 0,
    status: "approved",
  };

  const teacher = await teacherRepository.create(teacherData);

  await sendTeacherApprovalWithCredentialsEmail({
    toEmail: application.email,
    teacherName: application.name,
    email: application.email,
    password: generatedPassword,
  });

  const updatedApplication = await jobApplicationRepository.updateById(applicationId, {
    status: "approved",
  });

  return { application: updatedApplication, teacher };
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
  getInterviewTakenPaginated,
  getApplicationById,
  scheduleInterview,
  approveApplication,
  rejectApplication,
};
