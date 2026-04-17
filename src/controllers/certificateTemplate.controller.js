import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import certificateTemplateService from "../services/certificateTemplate.service.js";

// Upload or replace the global certificate template PDF + layout
export const uploadCertificateTemplate = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    throw new ApiError(400, "Template PDF file is required. Use field name 'pdf'.");
  }

  const { layout } = req.body;
  let textLayout = {};
  if (layout) {
    try {
      textLayout = JSON.parse(layout);
    } catch (e) {
      throw new ApiError(400, "Invalid layout JSON");
    }
  }

  const template = await certificateTemplateService.uploadCertificateTemplate(
    req.file.buffer,
    req.file.originalname || "certificate-template.pdf",
    textLayout
  );

  return res
    .status(201)
    .json(ApiResponse.success(template, "Certificate template uploaded successfully"));
});

// Get active certificate template (admin view)
export const getCertificateTemplate = asyncHandler(async (req, res) => {
  const template = await certificateTemplateService.getActiveCertificateTemplate();

  return res
    .status(200)
    .json(ApiResponse.success(template, "Active certificate template fetched"));
});

export default {
  uploadCertificateTemplate,
  getCertificateTemplate,
};

