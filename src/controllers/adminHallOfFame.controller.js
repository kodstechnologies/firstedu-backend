import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import adminHallOfFameService from "../services/adminHallOfFame.service.js";
import { uploadImageToCloudinary } from "../utils/s3Upload.js";
import { ApiError } from "../utils/ApiError.js";
// ==================== ADMIN CONTROLLERS ====================

export const createManualEntry = asyncHandler(async (req, res) => {
  const result = await adminHallOfFameService.createManualEntry(req.body, req.user._id);
  return res.status(201).json(
    ApiResponse.success(result, "Manual Hall of Fame entry created successfully")
  );
});

export const getManualEntries = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await adminHallOfFameService.getManualEntries(page, limit);
  return res.status(200).json(
    ApiResponse.success(result.entries, "Manual Hall of Fame entries fetched successfully", result.pagination)
  );
});

export const getManualEntryById = asyncHandler(async (req, res) => {
  const result = await adminHallOfFameService.getManualEntryById(req.params.id);
  return res.status(200).json(
    ApiResponse.success(result, "Entry fetched successfully")
  );
});

export const updateManualEntry = asyncHandler(async (req, res) => {
  const result = await adminHallOfFameService.updateManualEntry(req.params.id, req.body);
  return res.status(200).json(
    ApiResponse.success(result, "Entry updated successfully")
  );
});

export const deleteManualEntry = asyncHandler(async (req, res) => {
  const result = await adminHallOfFameService.deleteManualEntry(req.params.id);
  return res.status(200).json(
    ApiResponse.success(result, "Entry deleted successfully")
  );
});


export const uploadHallOfFameImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Image file is required");
  }

  if (!req.file.mimetype.startsWith('image/')) {
    throw new ApiError(400, "Only image files are allowed");
  }

  const imageUrl = await uploadImageToCloudinary(
    req.file.buffer,
    req.file.originalname,
    "hall-of-fame-images",
    req.file.mimetype
  );

  return res.status(200).json(
    ApiResponse.success({ url: imageUrl }, "Image uploaded successfully")
  );
});

export default {
  createManualEntry,
  getManualEntries,
  getManualEntryById,
  updateManualEntry,
  deleteManualEntry,
  uploadHallOfFameImage,
};
