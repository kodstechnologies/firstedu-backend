import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import pressAnnouncementService from "../services/pressAnnouncement.service.js";
import pressAnnouncementValidator from "../validation/pressAnnouncement.validator.js";

function normalizeBody(body) {
  const b = { ...body };
  if (typeof b.highlights === "string") {
    try {
      b.highlights = JSON.parse(b.highlights);
    } catch {
      b.highlights = b.highlights ? b.highlights.split(",").map((s) => s.trim()) : [];
    }
  }
  return b;
}

// ==================== ADMIN ====================

/**
 * Create press announcement
 * POST /admin/press-announcements
 */
export const createPressAnnouncement = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = pressAnnouncementValidator.createPressAnnouncement.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const announcement = await pressAnnouncementService.createPressAnnouncement(
    value,
    req.user._id,
    req.file
  );
  return res
    .status(201)
    .json(ApiResponse.success(announcement, "Press announcement created successfully"));
});

/**
 * Get all press announcements (admin) – pagination, optional filter by pressname, type
 * GET /admin/press-announcements?page=1&limit=10&pressname=...&type=press_release
 * type=allnews returns all types
 */
export const getAllPressAnnouncementsAdmin = asyncHandler(async (req, res) => {
  const { pressname, type, page, limit } = req.query;
  const filters = {};
  if (pressname) filters.pressname = pressname;
  if (type) filters.type = type;
  const result = await pressAnnouncementService.getAllPressAnnouncementsPaginated(
    filters,
    { page, limit }
  );
  return res.status(200).json(
    ApiResponse.success(
      result.list,
      "Press announcements fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get press announcement by ID (admin)
 * GET /admin/press-announcements/:id
 */
export const getPressAnnouncementByIdAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const announcement = await pressAnnouncementService.getPressAnnouncementById(id);
  return res
    .status(200)
    .json(ApiResponse.success(announcement, "Press announcement fetched successfully"));
});

/**
 * Update press announcement
 * PUT /admin/press-announcements/:id
 */
export const updatePressAnnouncement = asyncHandler(async (req, res) => {
  const body = normalizeBody(req.body);
  const { error, value } = pressAnnouncementValidator.updatePressAnnouncement.validate(body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  if (Object.keys(value).length === 0 && !req.file) {
    throw new ApiError(
      400,
      "At least one field (pressname, type, title, description, highlights) or image is required"
    );
  }
  const { id } = req.params;
  const announcement = await pressAnnouncementService.updatePressAnnouncement(
    id,
    value,
    req.file
  );
  return res
    .status(200)
    .json(ApiResponse.success(announcement, "Press announcement updated successfully"));
});

/**
 * Delete press announcement
 * DELETE /admin/press-announcements/:id
 */
export const deletePressAnnouncement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pressAnnouncementService.deletePressAnnouncement(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Press announcement deleted successfully"));
});

// ==================== USER (read only) ====================

/**
 * Get all press announcements (user) – pagination, optional filter by type
 * GET /user/press-announcements?page=1&limit=10&pressname=...&type=press_release
 * type=allnews returns all types (default behavior when type not sent)
 */
export const getAllPressAnnouncementsUser = asyncHandler(async (req, res) => {
  const { pressname, type, page, limit } = req.query;
  const filters = {};
  if (pressname) filters.pressname = pressname;
  if (type) filters.type = type; // allnews = no type filter, show all
  const result = await pressAnnouncementService.getAllPressAnnouncementsPaginated(
    filters,
    { page, limit }
  );
  return res.status(200).json(
    ApiResponse.success(
      result.list,
      "Press announcements fetched successfully",
      result.pagination
    )
  );
});

/**
 * Get press announcement by ID (user)
 * GET /user/press-announcements/:id
 */
export const getPressAnnouncementByIdUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const announcement = await pressAnnouncementService.getPressAnnouncementById(id);
  return res
    .status(200)
    .json(ApiResponse.success(announcement, "Press announcement fetched successfully"));
});

export default {
  createPressAnnouncement,
  getAllPressAnnouncementsAdmin,
  getPressAnnouncementByIdAdmin,
  updatePressAnnouncement,
  deletePressAnnouncement,
  getAllPressAnnouncementsUser,
  getPressAnnouncementByIdUser,
};
