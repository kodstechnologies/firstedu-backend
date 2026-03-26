import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import emailTemplateService from "../services/emailTemplate.service.js";
import emailTemplateValidator from "../validation/emailTemplate.validator.js";

/**
 * GET /admin/email-templates/categories
 * Returns predefined categories for dropdown
 */
export const getCategories = asyncHandler(async (req, res) => {
  const categories = emailTemplateService.getCategories();
  return res
    .status(200)
    .json(ApiResponse.success(categories, "Categories fetched successfully"));
});

/**
 * GET /admin/email-templates
 * List all templates, optionally filtered by category
 */
export const getTemplates = asyncHandler(async (req, res) => {
  const { category, search, page, limit } = req.query;
  const result = await emailTemplateService.getTemplatesPaginated({
    category: category || null,
    search: search || null,
    page,
    limit,
  });
  return res
    .status(200)
    .json(ApiResponse.success(result.list, "Templates fetched successfully", result.pagination));
});

/**
 * GET /admin/email-templates/:id
 */
export const getTemplateById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const template = await emailTemplateService.getTemplateById(id);
  return res
    .status(200)
    .json(ApiResponse.success(template, "Template fetched successfully"));
});

/**
 * POST /admin/email-templates
 */
export const createTemplate = asyncHandler(async (req, res) => {
  const { error, value } = emailTemplateValidator.createTemplate.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const template = await emailTemplateService.createTemplate(value);
  return res
    .status(201)
    .json(ApiResponse.success(template, "Template created successfully"));
});

/**
 * PUT /admin/email-templates/:id
 */
export const updateTemplate = asyncHandler(async (req, res) => {
  const { error, value } = emailTemplateValidator.updateTemplate.validate(req.body);
  if (error) {
    throw new ApiError(400, "Validation Error", error.details.map((x) => x.message));
  }
  const { id } = req.params;
  const template = await emailTemplateService.updateTemplate(id, value);
  return res
    .status(200)
    .json(ApiResponse.success(template, "Template updated successfully"));
});

/**
 * DELETE /admin/email-templates/:id
 */
export const deleteTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await emailTemplateService.deleteTemplate(id);
  return res
    .status(200)
    .json(ApiResponse.success(null, "Template deleted successfully"));
});

export default {
  getCategories,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
