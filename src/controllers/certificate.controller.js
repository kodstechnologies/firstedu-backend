import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import certificateService from "../services/certificate.service.js";

/**
 * Upload certificate PDF for student (admin)
 * Frontend generates PDF, sends as file with studentId and optional title in form-data
 */
export const uploadCertificate = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const { studentId, title } = req.body;

  if (!studentId) {
    throw new ApiError(400, "studentId is required");
  }

  if (!req.file || !req.file.buffer) {
    throw new ApiError(400, "PDF file is required. Use field name 'pdf'.");
  }

  const certificate = await certificateService.uploadCertificate(
    studentId,
    req.file.buffer,
    req.file.originalname || "certificate.pdf",
    adminId,
    title || null
  );

  return res.status(201).json(
    ApiResponse.success(certificate, "Certificate uploaded successfully")
  );
});

/**
 * Get all issued certificates (admin)
 */
export const getCertificates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, studentId, search } = req.query;
  const result = await certificateService.getCertificates(
    parseInt(page),
    parseInt(limit),
    studentId || null,
    search || null
  );

  return res.status(200).json(
    ApiResponse.success(result.certificates, "Certificates fetched", result.pagination)
  );
});

/**
 * Get certificate by ID (admin)
 */
export const getCertificateById = asyncHandler(async (req, res) => {
  const { certificateId } = req.params;
  const certificate = await certificateService.getCertificateById(certificateId);

  return res.status(200).json(ApiResponse.success(certificate, "Certificate fetched"));
});

/**
 * Get my certificates (student)
 */
export const getMyCertificates = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10 } = req.query;

  const result = await certificateService.getCertificates(
    parseInt(page),
    parseInt(limit),
    studentId
  );

  return res.status(200).json(
    ApiResponse.success(result.certificates, "Certificates fetched", result.pagination)
  );
});

/**
 * Get my certificate by ID (student - own only)
 */
export const getMyCertificateById = asyncHandler(async (req, res) => {
  const studentId = req.user._id;
  const { certificateId } = req.params;

  const certificate = await certificateService.getCertificateById(certificateId);

  if (certificate.student._id.toString() !== studentId.toString()) {
    throw new ApiError(403, "Unauthorized to access this certificate");
  }

  return res.status(200).json(ApiResponse.success(certificate, "Certificate fetched"));
});

export default {
  uploadCertificate,
  getCertificates,
  getCertificateById,
  getMyCertificates,
  getMyCertificateById,
};
