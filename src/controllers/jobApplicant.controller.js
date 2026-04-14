import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jobApplicantService from "../services/jobApplicant.service.js";
import jobApplicantValidator from "../validation/jobApplicant.validator.js";
import { uploadPDFToCloudinary } from "../utils/s3Upload.js";
import JobApplicant from "../models/JobApplicant.js";
import { sendInterviewScheduledEmail } from "../utils/sendEmail.js";

/**
 * Get all applicants for a specific job with filtering and pagination
 * GET /admin/carears/:jobId/applicants
 */
export const getApplicantsForJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const {
    search,
    status,
    location,
    experience,
    highestQualification,
    page: queryPage,
    limit: queryLimit,
  } = req.query;

  const page = parseInt(queryPage) || 1;
  const limit = parseInt(queryLimit) || 10;

  const filters = {
    search,
    status,
    location,
    experience,
    highestQualification,
  };

  const { applicants, total } = await jobApplicantService.getApplicantsByJobId(
    jobId,
    filters,
    page,
    limit,
  );

  return res.status(200).json(
    ApiResponse.success(applicants, "Applicants fetched successfully", {
      totalResults: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit: limit,
    }),
  );
});

/**
 * Get full details of an applicant
 * GET /admin/applicants/:id
 */
export const getApplicantDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const applicant = await jobApplicantService.getApplicantById(id);

  return res
    .status(200)
    .json(
      ApiResponse.success(applicant, "Applicant details fetched successfully"),
    );
});

/**
 * Update an applicant's status
 * PATCH /admin/applicants/:id/status
 */
export const updateApplicantStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = jobApplicantValidator.updateApplicantStatus.validate(
    req.body,
  );
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }

  const applicant = await jobApplicantService.updateApplicantStatus(id, value);

  // Send interview schedule email non-blocking — does not affect the API response
  if (value.status === "interview") {
    // Re-fetch with populated jobId to get job title for the email
    const populated = await jobApplicantService.getApplicantById(id);
    await sendInterviewScheduledEmail({
      toEmail: populated.email,
      teacherName: populated.fullName,
      jobTitle: populated.jobId?.title || "the position",
      interviewDate: value.date,
      interviewTime: value.time,
      interviewProvider: "",
      providerLink: value.meeting_link || "",
    });
  }

  return res
    .status(200)
    .json(
      ApiResponse.success(applicant, "Applicant status updated successfully"),
    );
});

/**
 * Apply to a job (Public)
 * POST /admin/carears/apply
 */
export const applyJob = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Handle resume file upload
  if (req.file) {
    try {
      const resumeUrl = await uploadPDFToCloudinary(
        req.file.buffer,
        req.file.originalname,
        "general-career-resumes",
      );
      body.resumeUrl = resumeUrl;
    } catch (uploadError) {
      throw new ApiError(
        500,
        `Failed to upload resume: ${uploadError.message}`,
      );
    }
  }

  const { error, value } =
    jobApplicantValidator.createJobApplicant.validate(body);
  if (error) {
    throw new ApiError(
      400,
      "Validation Error",
      error.details.map((x) => x.message),
    );
  }
  await jobApplicantService.updateApplicantCount(value.jobId);
  const applicant = await jobApplicantService.createJobApplicant(value);

  return res
    .status(201)
    .json(ApiResponse.success(applicant, "Application submitted successfully"));
});

export default {
  getApplicantsForJob,
  getApplicantDetails,
  updateApplicantStatus,
  applyJob,
};
