import blogRepository from "../repository/blog.repository.js";
import ApiError from "../utils/ApiError.js";
import { uploadImageToCloudinary, deleteFileFromCloudinary } from "../utils/s3Upload.js";

const BLOG_IMAGE_FOLDER = "blogs";

/**
 * Create blog from admin (admin-added blog)
 */
const createBlog = async (data, adminId, file) => {
  let imageUrl = null;
  if (file?.buffer) {
    imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      BLOG_IMAGE_FOLDER,
      file.mimetype
    );
  }
  return await blogRepository.create({
    ...data,
    image: imageUrl,
    source: "admin",
    createdBy: adminId,
  });
};

/**
 * List published blogs with filters, search, sort, and pagination (admin + student list routes).
 */
const getAllBlogs = async (filters = {}, options = {}) => {
  return await blogRepository.findAll(filters, options);
};

/**
 * Get blog by ID
 */
const getBlogById = async (id) => {
  const blog = await blogRepository.findById(id);
  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }
  return blog;
};

/**
 * Update blog (admin - any blog: admin-created or approved)
 */
const updateBlog = async (id, data, file) => {
  const blog = await blogRepository.findById(id);
  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }
  const updateData = { ...data };
  if (file?.buffer) {
    const imageUrl = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      BLOG_IMAGE_FOLDER,
      file.mimetype
    );
    if (blog.image) {
      await deleteFileFromCloudinary(blog.image);
    }
    updateData.image = imageUrl;
  }
  return await blogRepository.updateById(id, updateData);
};

/**
 * Delete blog (admin - any blog: admin-created or approved)
 */
const deleteBlog = async (id) => {
  const blog = await blogRepository.findById(id);
  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }
  if (blog.image) {
    await deleteFileFromCloudinary(blog.image);
  }
  return await blogRepository.deleteById(id);
};

export default {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
};
