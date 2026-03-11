import EmailTemplate from "../models/EmailTemplate.js";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  isValidCategorySlug,
} from "../utils/emailTemplateCategories.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Get all categories (for admin dropdown)
 */
export const getCategories = () => {
  return EMAIL_TEMPLATE_CATEGORIES;
};

/**
 * Get templates (optionally filter by category)
 */
export const getTemplates = async (category = null) => {
  const query = category ? { category } : {};
  const templates = await EmailTemplate.find(query).sort({ category: 1, slug: 1 });
  return templates;
};

/**
 * Get template by ID
 */
export const getTemplateById = async (id) => {
  const template = await EmailTemplate.findById(id);
  if (!template) {
    throw new ApiError(404, "Email template not found");
  }
  return template;
};

/**
 * Get template by category + slug (for resolving when sending emails)
 */
export const getTemplateByCategorySlug = async (category, slug) => {
  const template = await EmailTemplate.findOne({ category, slug });
  return template;
};

/**
 * Create template
 */
export const createTemplate = async (data) => {
  const { category, slug, name, subject, content } = data;

  if (!isValidCategorySlug(category, slug)) {
    throw new ApiError(400, "Invalid category or slug");
  }

  const existing = await EmailTemplate.findOne({ category, slug });
  if (existing) {
    throw new ApiError(409, "Template already exists for this category and type");
  }

  const template = await EmailTemplate.create({
    category,
    slug,
    name,
    subject,
    content,
  });

  return template;
};

/**
 * Update template
 */
export const updateTemplate = async (id, data) => {
  const template = await EmailTemplate.findById(id);
  if (!template) {
    throw new ApiError(404, "Email template not found");
  }

  const { name, subject, content } = data;
  if (name !== undefined) template.name = name;
  if (subject !== undefined) template.subject = subject;
  if (content !== undefined) template.content = content;

  await template.save();
  return template;
};

/**
 * Delete template
 */
export const deleteTemplate = async (id) => {
  const template = await EmailTemplate.findByIdAndDelete(id);
  if (!template) {
    throw new ApiError(404, "Email template not found");
  }
  return template;
};

/**
 * Replace {{variable}} placeholders in template string
 */
export const replaceTemplateVariables = (text, variables = {}) => {
  if (!text || typeof text !== "string") return text;
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value != null ? String(value) : "");
  }
  return result;
};

export default {
  getCategories,
  getTemplates,
  getTemplateById,
  getTemplateByCategorySlug,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  replaceTemplateVariables,
};
