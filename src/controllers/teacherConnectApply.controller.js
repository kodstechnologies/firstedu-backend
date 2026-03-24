import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import applyJobService from "../services/applyJob.service.js";
import jobApplicationService from "../services/jobApplication.service.js";
import applyJobValidator from "../validation/applyJob.validator.js";
import jobApplicationValidator from "../validation/jobApplication.validator.js";
import { uploadPDFToCloudinary } from "../utils/s3Upload.js";

function normalizeBody(body) {
  const b = { ...body };
  if (typeof b.skills === "string") {
    try {
      b.skills = JSON.parse(b.skills);
    } catch {
      b.skills = b.skills ? b.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  return b;
}

// ==================== ADMIN – Jobs ====================

/**
 * Create apply job (admin)
 * POST /admin/teacher-connect/jobs
 */
export const createApplyJob = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = applyJobValidator.createApplyJob.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const job = await applyJobService.createJob(value, req.user._id);
  return res.status(201).json(ApiResponse.success(job, "Job created successfully"));
});

/**
 * Get all jobs (admin) – pagination, optional filter by hiringFor, search
 * GET /admin/teacher-connect/jobs?page=1&limit=10&hiringFor=fulltime&search=math
 */
export const getAllApplyJobsAdmin = asyncHandler(async (req, res) => {
  const { hiringFor, search, page, limit } = req.query;
  const filters = {};
  if (hiringFor) filters.hiringFor = hiringFor;
  const result = await applyJobService.getAllJobsPaginated(filters, { page, limit, hiringFor, search });
  return res.status(200).json(
    ApiResponse.success(result.list, "Jobs fetched successfully", result.pagination)
  );
});

/**
 * Get job by ID (admin)
 * GET /admin/teacher-connect/jobs/:id
 */
export const getApplyJobByIdAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const job = await applyJobService.getJobById(id);
  return res.status(200).json(ApiResponse.success(job, "Job fetched successfully"));
});

/**
 * Update job (admin)
 * PUT /admin/teacher-connect/jobs/:id
 */
export const updateApplyJob = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = applyJobValidator.updateApplyJob.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  if (Object.keys(value).length === 0) {
    throw new ApiError(400, "At least one field to update is required");
  }
  const { id } = req.params;
  const job = await applyJobService.updateJob(id, value);
  return res.status(200).json(ApiResponse.success(job, "Job updated successfully"));
});

/**
 * Delete job (admin)
 * DELETE /admin/teacher-connect/jobs/:id
 */
export const deleteApplyJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await applyJobService.deleteJob(id);
  return res.status(200).json(ApiResponse.success(null, "Job deleted successfully"));
});

// ==================== ADMIN – Applications ====================

/**
 * Get all job applications (admin) – pagination, optional filter by jobId, status, search
 * Meta includes: totalJobs, totalInterviewTaken
 * GET /admin/teacher-connect/applications?page=1&limit=10&jobId=...&status=applied&search=john
 */
export const getAllApplicationsAdmin = asyncHandler(async (req, res) => {
  const { jobId, status, search, page, limit } = req.query;
  const result = await jobApplicationService.getAllApplicationsPaginated(
    {},
    { jobId, status, search, page, limit }
  );
  return res.status(200).json(
    ApiResponse.success(result.list, "Applications fetched successfully", result.pagination)
  );
});

/**
 * Get interview-taken applications (admin) – candidates whose scheduled interview date has passed
 * GET /admin/teacher-connect/interview-taken?page=1&limit=10&jobId=...&search=john
 */
export const getInterviewTakenAdmin = asyncHandler(async (req, res) => {
  const { jobId, search, page, limit } = req.query;
  const result = await jobApplicationService.getInterviewTakenPaginated({
    jobId,
    search,
    page,
    limit,
  });
  return res.status(200).json(
    ApiResponse.success(
      result.list,
      "Interview-taken applications fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get application by ID (admin)
 * GET /admin/teacher-connect/applications/:id
 */
export const getApplicationByIdAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const application = await jobApplicationService.getApplicationById(id);
  return res.status(200).json(ApiResponse.success(application, "Application fetched successfully"));
});

/**
 * Schedule interview for an application (admin)
 * POST /admin/teacher-connect/applications/:id/schedule-interview
 */
export const scheduleInterview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = jobApplicationValidator.scheduleInterview.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const application = await jobApplicationService.scheduleInterview(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(application, "Interview scheduled and email sent to candidate"));
});

/**
 * Approve application – auto-create teacher account and send credentials (admin)
 * POST /admin/teacher-connect/applications/:id/approve
 */
export const approveApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { application, teacher } = await jobApplicationService.approveApplication(id);
  return res.status(200).json(
    ApiResponse.success(
      { application, teacher },
      "Application approved; teacher account created and credentials sent to candidate"
    )
  );
});

/**
 * Reject application – remove from DB and send rejection email (admin)
 * POST /admin/teacher-connect/applications/:id/reject
 */
export const rejectApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await jobApplicationService.rejectApplication(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Application rejected; candidate removed and rejection email sent"));
});

// ==================== TEACHER / PUBLIC – Jobs (read) & Apply ====================

/**
 * Get all jobs (teachers can see – pagination, optional hiringFor)
 * GET /teacher-connect/jobs?page=1&limit=10&hiringFor=fulltime
 */
export const getAllApplyJobsUser = asyncHandler(async (req, res) => {
  const { hiringFor, page, limit } = req.query;
  const filters = {};
  if (hiringFor) filters.hiringFor = hiringFor;
  const result = await applyJobService.getAllJobsPaginated(filters, { page, limit, hiringFor });
  return res.status(200).json(
    ApiResponse.success(result.list, "Jobs fetched successfully", result.pagination)
  );
});

/**
 * Get job by ID (teachers can see)
 * GET /teacher-connect/jobs/:id
 */
export const getApplyJobByIdUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const job = await applyJobService.getJobById(id);
  return res.status(200).json(ApiResponse.success(job, "Job fetched successfully"));
});

/**
 * Apply for job (teacher) – name, email, phone, resume (PDF), jobId in body
 * POST /teacher-connect/apply
 * Expects: multipart with resume file + fields: jobId, name, email, phone
 */
export const applyForJob = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  const { error, value } = jobApplicationValidator.applyForJob.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  if (!req.file || !req.file.buffer) {
    throw new ApiError(400, "Resume (PDF) is required");
  }
  if (req.file.mimetype !== "application/pdf") {
    throw new ApiError(400, "Only PDF files are allowed for resume");
  }
  let resumeUrl;
  try {
    resumeUrl = await uploadPDFToCloudinary(
      req.file.buffer,
      req.file.originalname,
      "teacher-connect-resumes"
    );
  } catch (uploadError) {
    throw new ApiError(500, `Failed to upload resume: ${uploadError.message}`);
  }
  const application = await jobApplicationService.createApplication(value, resumeUrl);
  return res
    .status(201)
    .json(ApiResponse.success(application, "Application submitted successfully"));
});

export default {
  createApplyJob,
  getAllApplyJobsAdmin,
  getApplyJobByIdAdmin,
  updateApplyJob,
  deleteApplyJob,
  getAllApplicationsAdmin,
  getInterviewTakenAdmin,
  getApplicationByIdAdmin,
  scheduleInterview,
  approveApplication,
  rejectApplication,
  getAllApplyJobsUser,
  getApplyJobByIdUser,
  applyForJob,
};
