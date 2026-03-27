import { ApiError } from "../utils/ApiError.js";
import Certificate from "../models/Certificate.js";
import User from "../models/Student.js";
import { uploadPDFToCloudinary, sanitizeFileName } from "../utils/s3Upload.js";

/**
 * Build a friendly PDF label (e.g. jee-certificate.pdf) from section title or explicit name.
 * @param {string|null} title - e.g. "JEE", "NEET"
 * @param {string|null} explicitFileName - optional body field `fileName` from admin (e.g. jee-certificate.pdf)
 */
export const buildCertificateDisplayFileName = (title, explicitFileName) => {
  if (explicitFileName && String(explicitFileName).trim()) {
    let n = sanitizeFileName(String(explicitFileName).trim());
    if (!n.toLowerCase().endsWith(".pdf")) n = `${n}.pdf`;
    return n;
  }
  if (title && String(title).trim()) {
    const slug = sanitizeFileName(String(title).trim()).replace(/\.pdf$/i, "") || "certificate";
    return `${slug}-certificate.pdf`;
  }
  return "certificate.pdf";
};

/**
 * Base segment for S3 key (readable path; uniqueness via nanoid inside upload).
 */
const buildFriendlyBaseForS3 = (displayFileName) => {
  return sanitizeFileName(displayFileName).replace(/\.pdf$/i, "") || "certificate";
};

/**
 * Upload certificate PDF for a student (admin sends PDF generated from frontend)
 * @param {string|null} explicitFileName - optional `fileName` in form (e.g. jee-certificate.pdf)
 */
export const uploadCertificate = async (
  studentId,
  pdfBuffer,
  originalName,
  adminId,
  title = null,
  explicitFileName = null
) => {
  const student = await User.findById(studentId).select("name email");
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new ApiError(400, "PDF file is required");
  }

  const displayFileName = buildCertificateDisplayFileName(title, explicitFileName);
  const friendlyBase = buildFriendlyBaseForS3(displayFileName);

  const pdfUrl = await uploadPDFToCloudinary(
    pdfBuffer,
    originalName || displayFileName,
    "certificates",
    {
      friendlyBaseName: friendlyBase,
      contentDispositionFilename: displayFileName,
      contentDispositionAttachment: true,
    }
  );

  const certificate = await Certificate.create({
    student: studentId,
    pdfUrl,
    issuedBy: adminId,
    title: title || null,
    fileName: displayFileName,
  });

  return await Certificate.findById(certificate._id)
    .populate("student", "name email")
    .populate("issuedBy", "name email")
    .select("-fileName");
};

/**
 * Get all issued certificates
 */
export const getCertificates = async (page = 1, limit = 10, studentId = null, search = null) => {
  const query = studentId ? { student: studentId } : {};
  if (search && String(search).trim()) {
    const regex = { $regex: String(search).trim(), $options: "i" };
    query.$or = [{ title: regex }, { pdfUrl: regex }];
  }
  const skip = (page - 1) * limit;
  const [certificates, total] = await Promise.all([
    Certificate.find(query)
      .select("-fileName")
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
    .select("-fileName")
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
