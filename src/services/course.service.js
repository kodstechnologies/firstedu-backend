import { ApiError } from "../utils/ApiError.js";
import courseRepository from "../repository/course.repository.js";
import { uploadPDFToS3, deleteFileFromS3 } from "../utils/s3Upload.js";

export const createCourse = async (data, adminId, file) => {
  let contentUrl = data.contentUrl;

  // If file is provided, upload to S3
  if (file) {
    if (file.mimetype !== "application/pdf") {
      throw new ApiError(400, "Only PDF files are allowed");
    }
    contentUrl = await uploadPDFToS3(file.buffer, file.originalname, "courses");
  }

  if (!contentUrl) {
    throw new ApiError(400, "PDF file is required");
  }

  const course = await courseRepository.create({
    title: data.title,
    description: data.description,
    category: data.category,
    contentUrl,
    price: data.price || 0,
    isPublished: data.isPublished,
    createdBy: adminId,
  });
  return course;
};

export const getCourses = async (options = {}) => {
  return await courseRepository.findAll({}, options);
};

export const getCourseById = async (id) => {
  const course = await courseRepository.findById(id, { category: "name slug" });
  if (!course) {
    throw new ApiError(404, "Course not found");
  }
  return course;
};

export const updateCourse = async (id, data, file) => {
  const existingCourse = await courseRepository.findById(id);
  if (!existingCourse) {
    throw new ApiError(404, "Course not found");
  }

  let contentUrl = data.contentUrl || existingCourse.contentUrl;

  // If new file is provided, upload to S3 and delete old file
  if (file) {
    if (file.mimetype !== "application/pdf") {
      throw new ApiError(400, "Only PDF files are allowed");
    }

    // Delete old file from S3 if exists
    if (existingCourse.contentUrl) {
      await deleteFileFromS3(existingCourse.contentUrl);
    }

    // Upload new file
    contentUrl = await uploadPDFToS3(file.buffer, file.originalname, "courses");
  }

  const updateData = {
    ...data,
    contentUrl,
  };
  
  // Ensure price is included if provided
  if (data.price !== undefined) {
    updateData.price = data.price;
  }

  const updated = await courseRepository.updateById(id, updateData);
  
  return updated;
};

export const deleteCourse = async (id) => {
  const course = await courseRepository.findById(id);
  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  // Delete file from S3 if exists
  if (course.contentUrl) {
    await deleteFileFromS3(course.contentUrl);
  }

  await courseRepository.deleteById(id);
  return true;
};

export default {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
};


