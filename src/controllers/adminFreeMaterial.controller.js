import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import FreeMaterial from "../models/FreeMaterial.js";
import Category from "../models/Category.js";
import { uploadFileToCloudinary } from "../utils/s3Upload.js";

// ==================== ADMIN CONTROLLERS ====================

// @desc    Create a new free material
// @route   POST /api/v1/admin/free-materials
// Derive a fileType key from a MIME type string
function mimeToFileType(mime = "") {
  if (mime.startsWith("image/"))                                                      return "image";
  if (mime === "application/pdf")                                                      return "pdf";
  if (mime.startsWith("video/"))                                                       return "video";
  if (mime.startsWith("audio/"))                                                       return "audio";
  if (/zip|rar|7z|tar|gz|archive/.test(mime))                                         return "archive";
  if (/word|document|sheet|excel|powerpoint|presentation|opendocument/.test(mime))    return "document";
  return "other";
}

export const createMaterial = asyncHandler(async (req, res) => {
  const { category, subCategory } = req.body;
  let fileUrl = req.body.fileUrl;

  if (!category || !subCategory) {
    return res.status(400).json(ApiResponse.error("Fields category and subCategory are required", 400));
  }

  // Auto-derive fileType from actual uploaded file MIME; fall back to 'other' for link-only entries
  const fileType = req.file ? mimeToFileType(req.file.mimetype) : "other";

  // If a file was uploaded, upload it to S3/Cloudinary and get the URL
  if (req.file) {
    fileUrl = await uploadFileToCloudinary(
      req.file.buffer,
      req.file.originalname,
      `free-materials/${fileType}`,
      req.file.mimetype
    );
  }

  if (!fileUrl) {
    return res.status(400).json(ApiResponse.error("File or File URL is required", 400));
  }

  const newMaterial = await FreeMaterial.create({
    fileType,
    fileUrl,
    category,
    subCategory,
  });

  return res.status(201).json(
    ApiResponse.success(newMaterial, "Free material uploaded successfully")
  );
});

// @desc    Get all free materials (with optional filters)
// @route   GET /api/v1/admin/free-materials
export const getMaterials = asyncHandler(async (req, res) => {
  const { category, subCategory } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (subCategory) filter.subCategory = subCategory;

  const materials = await FreeMaterial.find(filter)
    .populate('category', 'name slug')
    .populate('subCategory', 'name slug')
    .sort({ createdAt: -1 });

  return res.status(200).json(
    ApiResponse.success(materials, "Free materials fetched successfully")
  );
});

// @desc    Delete a free material
// @route   DELETE /api/v1/admin/free-materials/:id
export const deleteMaterial = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const material = await FreeMaterial.findByIdAndDelete(id);

  if (!material) {
    return res.status(404).json(ApiResponse.error("Free material not found", 404));
  }

  return res.status(200).json(
    ApiResponse.success(null, "Free material deleted successfully")
  );
});

export default {
  createMaterial,
  getMaterials,
  deleteMaterial,
};
