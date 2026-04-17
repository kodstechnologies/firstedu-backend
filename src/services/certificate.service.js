import { ApiError } from "../utils/ApiError.js";
import Certificate from "../models/Certificate.js";
import User from "../models/Student.js";
import Course from "../models/Course.js";
import { uploadPDFToCloudinary, sanitizeFileName } from "../utils/s3Upload.js";
import certificateTemplateService from "./certificateTemplate.service.js";
import courseTestLinkRepository from "../repository/courseTestLink.repository.js";
import orderRepository from "../repository/order.repository.js";
import { sendNotificationToStudent } from "./notification.service.js";
import examSessionRepository from "../repository/examSession.repository.js";
import { PDFDocument, StandardFonts } from "pdf-lib";

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

/**
 * Issue course-completion certificate for a certification course when all linked tests are completed.
 * Idempotent: if a certificate already exists for (student, course), it does nothing.
 */
export const issueCourseCompletionCertificate = async (studentId, testId) => {
  const student = await User.findById(studentId).select("name email");
  if (!student) {
    throw new ApiError(404, "Student not found");
  }

  // Find purchased certification courses for this student that link the given test
  const coursePurchases = await orderRepository.findCoursePurchases(studentId);
  const courseIds = coursePurchases
    .map((p) => p.course?._id || p.course)
    .filter(Boolean);
  if (courseIds.length === 0) return null;

  const links = await courseTestLinkRepository.findAll({
    course: { $in: courseIds },
    test: testId,
  });
  if (!links || links.length === 0) return null;

  const now = new Date();
  const results = [];

  for (const link of links) {
    const courseId = link.course?._id || link.course;
    if (!courseId) continue;

    const course = await Course.findById(courseId);
    if (!course || !course.isCertification) continue;

    // Idempotency: skip if certificate already issued for this course & student
    const existing = await Certificate.findOne({
      student: studentId,
      title: new RegExp(`^${sanitizeFileName(course.title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - Completion$`, "i"),
    });
    if (existing) {
      continue;
    }

    // Check that all tests linked to this course have a completed exam session for this student
    const courseLinks = await courseTestLinkRepository.findAll({
      course: courseId,
    });
    const allTestIds = courseLinks
      .map((l) => l.test?._id || l.test)
      .filter(Boolean);
    if (allTestIds.length === 0) continue;

    const sessions = await examSessionRepository.findCompletedSessionsForStudentAndTests(
      studentId,
      allTestIds
    );
    const completedTestIdSet = new Set(
      sessions.map((s) => s.test?.toString?.()).filter(Boolean)
    );
    const allCompleted = allTestIds.every((id) =>
      completedTestIdSet.has(id.toString())
    );
    if (!allCompleted) continue;

    // Generate certificate PDF from template
    const template = await certificateTemplateService.getActiveCertificateTemplate();

    const response = await fetch(template.pdfTemplateUrl);
    const arrayBuffer = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const page = pdfDoc.getPage(0);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();

    const layout = template.textLayout || {};
    const studentPos = layout.studentName || { x: width / 2, y: height / 2 };
    const coursePos = layout.courseTitle || {
      x: width / 2,
      y: height / 2 - 40,
    };
    const datePos = layout.issuedAt || { x: width / 2, y: 60 };

    page.drawText(student.name || "Student", {
      x: studentPos.x,
      y: studentPos.y,
      size: studentPos.size || 18,
      font,
    });
    page.drawText(course.title || "Course", {
      x: coursePos.x,
      y: coursePos.y,
      size: coursePos.size || 16,
      font,
    });
    page.drawText(now.toISOString().split("T")[0], {
      x: datePos.x,
      y: datePos.y,
      size: datePos.size || 12,
      font,
    });

    const pdfBytes = await pdfDoc.save();

    const title = `${course.title || "Course"} - Completion`;
    const displayFileName = buildCertificateDisplayFileName(title, null);
    const friendlyBase = buildFriendlyBaseForS3(displayFileName);

    const pdfUrl = await uploadPDFToCloudinary(
      Buffer.from(pdfBytes),
      displayFileName,
      "certificates",
      {
        friendlyBaseName: friendlyBase,
        contentDispositionFilename: displayFileName,
        contentDispositionAttachment: true,
      }
    );

    const cert = await Certificate.create({
      student: studentId,
      pdfUrl,
      issuedBy: null,
      title,
      fileName: displayFileName,
    });

    // Notify student (in-app + push)
    try {
      await sendNotificationToStudent(
        studentId,
        "Certificate issued",
        `Your certificate for ${course.title} is now available.`,
        {
          type: "certificate",
          courseId: courseId.toString(),
          certificateId: cert._id.toString(),
        },
        null
      );
    } catch (e) {
      // Log only; do not break issuance
      console.error("Failed to send certificate notification:", e);
    }

    results.push(cert);
  }

  return results;
};

export default {
  uploadCertificate,
  getCertificates,
  getCertificateById,
  issueCourseCompletionCertificate,
};
