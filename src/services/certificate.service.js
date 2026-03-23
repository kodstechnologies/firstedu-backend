import { ApiError } from "../utils/ApiError.js";
import Certificate from "../models/Certificate.js";
import User from "../models/Student.js";
import { uploadPDFToCloudinary } from "../utils/s3Upload.js";

/**
 * Upload certificate PDF for a student (admin sends PDF generated from frontend)
 */
export const uploadCertificate = async (studentId, pdfBuffer, originalName, adminId, title = null) => {
  const student = await User.findById(studentId).select("name email");
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new ApiError(400, "PDF file is required");
  }

  const pdfUrl = await uploadPDFToCloudinary(
    pdfBuffer,
    originalName || `certificate-${studentId}-${Date.now()}.pdf`,
    "certificates"
  );

  const certificate = await Certificate.create({
    student: studentId,
    pdfUrl,
    issuedBy: adminId,
    title: title || null,
  });

  return await Certificate.findById(certificate._id)
    .populate("student", "name email")
    .populate("issuedBy", "name email");
};

/**
 * Get all issued certificates
 */
export const getCertificates = async (page = 1, limit = 10, studentId = null) => {
  const query = studentId ? { student: studentId } : {};
  const skip = (page - 1) * limit;
  const [certificates, total] = await Promise.all([
    Certificate.find(query)
      .populate("student", "name email")
      .populate("issuedBy", "name email")
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(limit),
    Certificate.countDocuments(query),
  ]);
  return {
    certificates,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

/**
 * Get certificate by ID
 */
export const getCertificateById = async (certificateId) => {
  const certificate = await Certificate.findById(certificateId)
    .populate("student", "name email")
    .populate("issuedBy", "name email");
  if (!certificate) {
    throw new ApiError(404, "Certificate not found");
  }
  return certificate;
};

export default {
  uploadCertificate,
  getCertificates,
  getCertificateById,
};
