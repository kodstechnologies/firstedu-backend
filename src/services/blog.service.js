import blogRepository from "../repository/blog.repository.js";
import ApiError from "../utils/ApiError.js";
import { uploadImageToCloudinary, uploadPDFToCloudinary, deleteFileFromCloudinary } from "../utils/s3Upload.js";

const BLOG_IMAGE_FOLDER = "blogs";
const BLOG_DOCUMENT_FOLDER = "blogs/documents";

/**
 * Create blog from admin (admin-added blog)
 */
const createBlog = async (data, adminId, imageFile, documentFile) => {
  let imageUrl = null;
  if (imageFile?.buffer) {
    imageUrl = await uploadImageToCloudinary(
      imageFile.buffer,
      imageFile.originalname,
      BLOG_IMAGE_FOLDER,
      imageFile.mimetype
    );
  }
  let documentUrl = null;
  let documentName = data.documentName || null;
  if (documentFile?.buffer) {
    documentUrl = await uploadPDFToCloudinary(
      documentFile.buffer,
      documentFile.originalname,
      BLOG_DOCUMENT_FOLDER,
      { contentDispositionFilename: documentFile.originalname }
    );
    if (!documentName) documentName = documentFile.originalname;
  }
  return await blogRepository.create({
    ...data,
    image: imageUrl,
    document: documentUrl,
    documentName,
    source: "admin",
    createdBy: adminId,
  });
};

/**
 * List published blogs with filters, search, sort, and pagination (admin + student list routes).
 */
const getAllBlogs = async (filters, page, limit) => {
  return await blogRepository.findAll(filters, page, limit);
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
const updateBlog = async (id, data, imageFile, documentFile) => {
  const blog = await blogRepository.findById(id);
  if (!blog) {
    throw new ApiError(404, "Blog not found");
  }
  const updateData = { ...data };
  // Handle image update
  if (imageFile?.buffer) {
    const imageUrl = await uploadImageToCloudinary(
      imageFile.buffer,
      imageFile.originalname,
      BLOG_IMAGE_FOLDER,
      imageFile.mimetype
    );
    if (blog.image) {
      await deleteFileFromCloudinary(blog.image);
    }
    updateData.image = imageUrl;
  }
  // Handle document update
  if (documentFile?.buffer) {
    const documentUrl = await uploadPDFToCloudinary(
      documentFile.buffer,
      documentFile.originalname,
      BLOG_DOCUMENT_FOLDER,
      { contentDispositionFilename: documentFile.originalname }
    );
    if (blog.document) {
      await deleteFileFromCloudinary(blog.document);
    }
    updateData.document = documentUrl;
    if (!updateData.documentName) {
      updateData.documentName = documentFile.originalname;
    }
  }
  // Handle document removal
  if (data.removeDocument) {
    if (blog.document) {
      await deleteFileFromCloudinary(blog.document);
    }
    updateData.document = null;
    updateData.documentName = null;
    delete updateData.removeDocument;
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
