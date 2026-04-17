import CertificateTemplate from "../models/CertificateTemplate.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadPDFToCloudinary } from "../utils/s3Upload.js";

export const uploadCertificateTemplate = async (pdfBuffer, originalName, textLayout = {}) => {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new ApiError(400, "Template PDF file is required");
  }

  const pdfUrl = await uploadPDFToCloudinary(
    pdfBuffer,
    originalName || "certificate-template.pdf",
    "certificate-templates"
  );

  // Deactivate existing templates
  await CertificateTemplate.updateMany({}, { $set: { isActive: false } });

  const doc = await CertificateTemplate.create({
    pdfTemplateUrl: pdfUrl,
    textLayout: textLayout || {},
    isActive: true,
  });

  return doc;
};

export const getActiveCertificateTemplate = async () => {
  const tpl = await CertificateTemplate.findOne({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  if (!tpl) {
    throw new ApiError(404, "No active certificate template configured");
  }
  return tpl;
};

export default {
  uploadCertificateTemplate,
  getActiveCertificateTemplate,
};

