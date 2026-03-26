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

export const getTemplatesPaginated = async ({
  category = null,
  search = null,
  page = 1,
  limit = 10,
} = {}) => {
  const query = {};
  if (category) query.category = category;
  if (search && String(search).trim()) {
    const regex = { $regex: String(search).trim(), $options: "i" };
    query.$or = [{ name: regex }, { subject: regex }, { slug: regex }, { content: regex }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [list, total] = await Promise.all([
    EmailTemplate.find(query)
      .sort({ category: 1, slug: 1 })
      .skip(skip)
      .limit(limitNum),
    EmailTemplate.countDocuments(query),
  ]);

  return {
    list,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  };
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
  getTemplatesPaginated,
  getTemplateById,
  getTemplateByCategorySlug,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  replaceTemplateVariables,
};
